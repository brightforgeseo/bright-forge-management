import React, { useState, useEffect, useRef } from 'react';
import {
  Video, VideoOff, Mic, MicOff, Monitor, PhoneOff, Users,
  Maximize2, Minimize2, X
} from 'lucide-react';
import { webrtcService } from '../services/webrtcService';
import { User } from '../types';

interface VideoCallProps {
  roomId: string;
  currentUser: User;
  channelName: string;
  videoEnabled: boolean;
  onClose: () => void;
}

interface RemoteParticipant {
odisconnectionId: string;
  odisconnectionName: string;
  stream: MediaStream;
}

const VideoCall: React.FC<VideoCallProps> = ({
  roomId,
  currentUser,
  channelName,
  videoEnabled: initialVideoEnabled,
  onClose
}) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<Map<string, RemoteParticipant>>(new Map());
  const [videoEnabled, setVideoEnabled] = useState(initialVideoEnabled);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initializeCall();

    return () => {
      webrtcService.leaveRoom();
    };
  }, []);

  const initializeCall = async () => {
    try {
      // Set up callbacks
      webrtcService.onLocalStream = (stream) => {
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      };

      webrtcService.onParticipantJoined = (odisconnectionId, odisconnectionName, stream) => {
        console.log('[VideoCall] Participant joined:', odisconnectionName);
        setRemoteParticipants(prev => {
          const updated = new Map(prev);
          updated.set(odisconnectionId, { odisconnectionId, odisconnectionName, stream });
          return updated;
        });
      };

      webrtcService.onParticipantLeft = (odisconnectionId) => {
        console.log('[VideoCall] Participant left:', odisconnectionId);
        setRemoteParticipants(prev => {
          const updated = new Map(prev);
          updated.delete(odisconnectionId);
          return updated;
        });
      };

      webrtcService.onError = (error) => {
        console.error('[VideoCall] Error:', error);
      };

      // Initialize local stream
      await webrtcService.initializeLocalStream(initialVideoEnabled, true);

      // Join the room
      await webrtcService.joinRoom(roomId, currentUser.id, currentUser.name);

      setIsConnecting(false);
    } catch (error) {
      console.error('[VideoCall] Failed to initialize:', error);
      setIsConnecting(false);
    }
  };

  const toggleVideo = () => {
    const newState = !videoEnabled;
    setVideoEnabled(newState);
    webrtcService.toggleVideo(newState);
  };

  const toggleAudio = () => {
    const newState = !audioEnabled;
    setAudioEnabled(newState);
    webrtcService.toggleAudio(newState);
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await webrtcService.stopScreenShare();
      setIsScreenSharing(false);
    } else {
      const stream = await webrtcService.startScreenShare();
      if (stream) {
        setIsScreenSharing(true);
      }
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleEndCall = async () => {
    await webrtcService.leaveRoom();
    onClose();
  };

  const participantCount = remoteParticipants.size + 1; // +1 for self

  // Calculate grid layout
  const getGridClass = () => {
    if (participantCount === 1) return 'grid-cols-1';
    if (participantCount === 2) return 'grid-cols-2';
    if (participantCount <= 4) return 'grid-cols-2';
    return 'grid-cols-3';
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-slate-900 z-50 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-slate-800/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-white">
            <Users className="w-5 h-5" />
            <span className="font-medium">{channelName}</span>
            <span className="text-slate-400 text-sm">({participantCount} in call)</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleFullscreen}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
          <button
            onClick={handleEndCall}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Video Grid */}
      <div className={`flex-1 p-4 grid ${getGridClass()} gap-4 auto-rows-fr`}>
        {/* Local Video */}
        <div className="relative bg-slate-800 rounded-xl overflow-hidden">
          {isConnecting ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-slate-400">Connecting...</p>
              </div>
            </div>
          ) : (
            <>
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-full object-cover ${!videoEnabled ? 'hidden' : ''}`}
              />
              {!videoEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-700">
                  <div className="w-20 h-20 rounded-full bg-brand-600 flex items-center justify-center">
                    <span className="text-2xl font-bold text-white">
                      {currentUser.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                </div>
              )}
              <div className="absolute bottom-3 left-3 px-3 py-1 bg-black/50 rounded-lg">
                <span className="text-white text-sm font-medium">You</span>
              </div>
              {!audioEnabled && (
                <div className="absolute top-3 right-3 p-2 bg-red-500 rounded-full">
                  <MicOff className="w-4 h-4 text-white" />
                </div>
              )}
            </>
          )}
        </div>

        {/* Remote Participants */}
        {Array.from(remoteParticipants.values()).map((participant) => (
          <RemoteVideo
            key={participant.odisconnectionId}
            participant={participant}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="p-6 bg-slate-800/50">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={toggleAudio}
            className={`p-4 rounded-full transition-colors ${
              audioEnabled
                ? 'bg-slate-700 hover:bg-slate-600 text-white'
                : 'bg-red-500 hover:bg-red-600 text-white'
            }`}
            title={audioEnabled ? 'Mute' : 'Unmute'}
          >
            {audioEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
          </button>

          <button
            onClick={toggleVideo}
            className={`p-4 rounded-full transition-colors ${
              videoEnabled
                ? 'bg-slate-700 hover:bg-slate-600 text-white'
                : 'bg-red-500 hover:bg-red-600 text-white'
            }`}
            title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
          >
            {videoEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
          </button>

          <button
            onClick={toggleScreenShare}
            className={`p-4 rounded-full transition-colors ${
              isScreenSharing
                ? 'bg-brand-500 hover:bg-brand-600 text-white'
                : 'bg-slate-700 hover:bg-slate-600 text-white'
            }`}
            title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
          >
            <Monitor className="w-6 h-6" />
          </button>

          <button
            onClick={handleEndCall}
            className="p-4 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors"
            title="End call"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};

// Remote video component
const RemoteVideo: React.FC<{ participant: RemoteParticipant }> = ({ participant }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

  const hasVideo = participant.stream?.getVideoTracks().some(track => track.enabled);

  return (
    <div className="relative bg-slate-800 rounded-xl overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-cover ${!hasVideo ? 'hidden' : ''}`}
      />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-700">
          <div className="w-20 h-20 rounded-full bg-slate-600 flex items-center justify-center">
            <span className="text-2xl font-bold text-white">
              {participant.odisconnectionName.charAt(0).toUpperCase()}
            </span>
          </div>
        </div>
      )}
      <div className="absolute bottom-3 left-3 px-3 py-1 bg-black/50 rounded-lg">
        <span className="text-white text-sm font-medium">{participant.odisconnectionName}</span>
      </div>
    </div>
  );
};

export default VideoCall;
