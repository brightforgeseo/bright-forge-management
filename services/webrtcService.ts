import { supabase } from '../lib/supabaseClient';

// TURN server configuration from Metered.ca
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'stun:brightforge.metered.live:80'
  },
  {
    urls: 'turn:brightforge.metered.live:80',
    username: 'brightforge',
    credential: 'FeBVVP45AYViorgx64G3VdhciwmET2F89rpXMEhAz9y1_yrq'
  },
  {
    urls: 'turn:brightforge.metered.live:80?transport=tcp',
    username: 'brightforge',
    credential: 'FeBVVP45AYViorgx64G3VdhciwmET2F89rpXMEhAz9y1_yrq'
  },
  {
    urls: 'turn:brightforge.metered.live:443',
    username: 'brightforge',
    credential: 'FeBVVP45AYViorgx64G3VdhciwmET2F89rpXMEhAz9y1_yrq'
  },
  {
    urls: 'turns:brightforge.metered.live:443',
    username: 'brightforge',
    credential: 'FeBVVP45AYViorgx64G3VdhciwmET2F89rpXMEhAz9y1_yrq'
  }
];

export interface Participant {
  odisconnection: RTCPeerConnection | null;
  userId: string;
  userName: string;
  stream: MediaStream | null;
  videoEnabled: boolean;
  audioEnabled: boolean;
}

export interface CallState {
  roomId: string;
  participants: Map<string, Participant>;
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  isScreenSharing: boolean;
}

type SignalType = 'offer' | 'answer' | 'ice-candidate' | 'join' | 'leave' | 'screen-share-start' | 'screen-share-stop';

interface SignalMessage {
  type: SignalType;
  from: string;
  fromName: string;
  to?: string;
  roomId: string;
  payload?: any;
}

class WebRTCService {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private roomId: string | null = null;
  private userId: string = '';
  private userName: string = '';
  private channel: any = null;

  // Callbacks
  public onParticipantJoined: ((userId: string, userName: string, stream: MediaStream) => void) | null = null;
  public onParticipantLeft: ((userId: string) => void) | null = null;
  public onLocalStream: ((stream: MediaStream) => void) | null = null;
  public onScreenShare: ((userId: string, stream: MediaStream | null) => void) | null = null;
  public onError: ((error: string) => void) | null = null;

  // Set TURN credentials (call this after getting credentials from Metered.ca)
  setTurnCredentials(url: string, username: string, credential: string) {
    ICE_SERVERS.push({
      urls: url,
      username,
      credential
    } as any);
  }

  async initializeLocalStream(video: boolean = true, audio: boolean = true): Promise<MediaStream> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: video ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        audio: audio ? { echoCancellation: true, noiseSuppression: true } : false
      });

      if (this.onLocalStream) {
        this.onLocalStream(this.localStream);
      }

      return this.localStream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      if (this.onError) {
        this.onError('Could not access camera/microphone. Please check permissions.');
      }
      throw error;
    }
  }

  async joinRoom(roomId: string, userId: string, userName: string): Promise<void> {
    this.roomId = roomId;
    this.userId = userId;
    this.userName = userName;

    // Subscribe to signaling channel
    this.channel = supabase.channel(`call:${roomId}`, {
      config: { broadcast: { self: false } }
    });

    this.channel
      .on('broadcast', { event: 'signal' }, ({ payload }: { payload: SignalMessage }) => {
        this.handleSignal(payload);
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          // Announce joining
          await this.broadcast({
            type: 'join',
            from: this.userId,
            fromName: this.userName,
            roomId: this.roomId!
          });
        }
      });
  }

  private async broadcast(message: SignalMessage): Promise<void> {
    if (this.channel) {
      await this.channel.send({
        type: 'broadcast',
        event: 'signal',
        payload: message
      });
    }
  }

  private async handleSignal(message: SignalMessage): Promise<void> {
    // Ignore messages from self
    if (message.from === this.userId) return;

    // Ignore messages not meant for us (if specified)
    if (message.to && message.to !== this.userId) return;

    console.log('[WebRTC] Received signal:', message.type, 'from:', message.fromName);

    switch (message.type) {
      case 'join':
        await this.handlePeerJoin(message.from, message.fromName);
        break;
      case 'offer':
        await this.handleOffer(message.from, message.fromName, message.payload);
        break;
      case 'answer':
        await this.handleAnswer(message.from, message.payload);
        break;
      case 'ice-candidate':
        await this.handleIceCandidate(message.from, message.payload);
        break;
      case 'leave':
        this.handlePeerLeave(message.from);
        break;
      case 'screen-share-start':
        if (this.onScreenShare) {
          // The actual stream will come through the peer connection
        }
        break;
      case 'screen-share-stop':
        if (this.onScreenShare) {
          this.onScreenShare(message.from, null);
        }
        break;
    }
  }

  private async handlePeerJoin(peerId: string, peerName: string): Promise<void> {
    console.log('[WebRTC] Peer joined:', peerName);

    // Create offer for the new peer
    const pc = this.createPeerConnection(peerId, peerName);

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await this.broadcast({
      type: 'offer',
      from: this.userId,
      fromName: this.userName,
      to: peerId,
      roomId: this.roomId!,
      payload: offer
    });
  }

  private async handleOffer(peerId: string, peerName: string, offer: RTCSessionDescriptionInit): Promise<void> {
    console.log('[WebRTC] Received offer from:', peerName);

    const pc = this.createPeerConnection(peerId, peerName);

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await this.broadcast({
      type: 'answer',
      from: this.userId,
      fromName: this.userName,
      to: peerId,
      roomId: this.roomId!,
      payload: answer
    });
  }

  private async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    console.log('[WebRTC] Received answer from peer');

    const pc = this.peerConnections.get(peerId);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  private async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.peerConnections.get(peerId);
    if (pc && candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    }
  }

  private handlePeerLeave(peerId: string): void {
    console.log('[WebRTC] Peer left:', peerId);

    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }

    if (this.onParticipantLeft) {
      this.onParticipantLeft(peerId);
    }
  }

  private createPeerConnection(peerId: string, peerName: string): RTCPeerConnection {
    // Close existing connection if any
    if (this.peerConnections.has(peerId)) {
      this.peerConnections.get(peerId)?.close();
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peerConnections.set(peerId, pc);

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.broadcast({
          type: 'ice-candidate',
          from: this.userId,
          fromName: this.userName,
          to: peerId,
          roomId: this.roomId!,
          payload: event.candidate
        });
      }
    };

    // Handle incoming tracks
    pc.ontrack = (event) => {
      console.log('[WebRTC] Received track from:', peerName);
      if (this.onParticipantJoined && event.streams[0]) {
        this.onParticipantJoined(peerId, peerName, event.streams[0]);
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', pc.connectionState);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.handlePeerLeave(peerId);
      }
    };

    return pc;
  }

  async startScreenShare(): Promise<MediaStream | null> {
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as any,
        audio: false
      });

      // Replace video track in all peer connections
      const videoTrack = this.screenStream.getVideoTracks()[0];

      this.peerConnections.forEach((pc) => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      });

      // Notify others
      await this.broadcast({
        type: 'screen-share-start',
        from: this.userId,
        fromName: this.userName,
        roomId: this.roomId!
      });

      // Handle screen share stop
      videoTrack.onended = () => {
        this.stopScreenShare();
      };

      return this.screenStream;
    } catch (error) {
      console.error('Error starting screen share:', error);
      if (this.onError) {
        this.onError('Could not start screen sharing');
      }
      return null;
    }
  }

  async stopScreenShare(): Promise<void> {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }

    // Replace with camera track
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        this.peerConnections.forEach((pc) => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(videoTrack);
          }
        });
      }
    }

    // Notify others
    await this.broadcast({
      type: 'screen-share-stop',
      from: this.userId,
      fromName: this.userName,
      roomId: this.roomId!
    });
  }

  toggleVideo(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  toggleAudio(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  async leaveRoom(): Promise<void> {
    // Notify others
    if (this.roomId) {
      await this.broadcast({
        type: 'leave',
        from: this.userId,
        fromName: this.userName,
        roomId: this.roomId
      });
    }

    // Close all peer connections
    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();

    // Stop local streams
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }

    // Unsubscribe from channel
    if (this.channel) {
      await supabase.removeChannel(this.channel);
      this.channel = null;
    }

    this.roomId = null;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  isInRoom(): boolean {
    return this.roomId !== null;
  }
}

// Export singleton instance
export const webrtcService = new WebRTCService();
