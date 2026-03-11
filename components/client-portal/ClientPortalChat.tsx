import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Paperclip,
  Image,
  File,
  Loader2,
  Check,
  CheckCheck,
  User,
  X,
} from 'lucide-react';
import { PartnerAccount, PartnerMessage } from '../../types-portal';
import { ToastType } from '../../types';
import { supabase } from '../../lib/supabaseClient';
import { uploadFile } from '../../services/databaseService';
import {
  fetchPartnerMessages,
  sendPartnerMessage,
  markPartnerMessagesRead,
  subscribeToPartnerMessages,
} from '../../services/clientPortalService';

interface ClientPortalChatProps {
  partnerAccount: PartnerAccount;
  addToast: (type: ToastType, message: string) => void;
  onMessagesRead: () => void;
}

const ClientPortalChat: React.FC<ClientPortalChatProps> = ({
  partnerAccount,
  addToast,
  onMessagesRead,
}) => {
  const [messages, setMessages] = useState<PartnerMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [stagedAttachment, setStagedAttachment] = useState<{ url: string; file: File; type: 'image' | 'file'; name: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMessages();
  }, [partnerAccount.id]);

  useEffect(() => {
    // Subscribe to new messages
    const channel = subscribeToPartnerMessages(partnerAccount.id, (newMsg) => {
      setMessages((prev) => [...prev, newMsg]);
      scrollToBottom();

      // If message is from team, mark as read since we're viewing the chat
      if (newMsg.sender_type === 'team') {
        markPartnerMessagesRead(partnerAccount.id, 'partner');
        onMessagesRead();
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [partnerAccount.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async () => {
    setIsLoading(true);
    try {
      const data = await fetchPartnerMessages(partnerAccount.id);
      setMessages(data);

      // Mark messages as read
      await markPartnerMessagesRead(partnerAccount.id, 'partner');
      onMessagesRead();
    } catch (err) {
      console.error('Error loading messages:', err);
      addToast('error', 'Failed to load messages');
    } finally {
      setIsLoading(false);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleSend = async () => {
    // Allow sending if there's a message OR a staged attachment
    if (!newMessage.trim() && !stagedAttachment) return;

    setIsSending(true);
    try {
      // Determine message text
      let messageText = newMessage.trim();
      if (!messageText && stagedAttachment) {
        messageText = stagedAttachment.type === 'image' ? 'Sent an image' : `Sent a file: ${stagedAttachment.name}`;
      }

      const message = await sendPartnerMessage(
        partnerAccount.id,
        messageText,
        'partner',
        partnerAccount.id,
        partnerAccount.full_name,
        stagedAttachment?.url,
        stagedAttachment?.type,
        stagedAttachment?.name
      );

      if (message) {
        setMessages((prev) => [...prev, message]);
        setNewMessage('');
        setStagedAttachment(null);
        scrollToBottom();
      } else {
        addToast('error', 'Failed to send message');
      }
    } catch (err) {
      console.error('Error sending message:', err);
      addToast('error', 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const url = await uploadFile(file, 'uploads');
      if (url) {
        const isImage = file.type.startsWith('image/');
        // Stage the file for preview instead of sending immediately
        setStagedAttachment({
          url,
          file,
          type: isImage ? 'image' : 'file',
          name: file.name
        });
      } else {
        addToast('error', 'Failed to upload file');
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      addToast('error', 'Failed to upload file');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          // Stage the image for preview instead of sending immediately
          setIsUploading(true);
          try {
            const url = await uploadFile(file, 'uploads');
            if (url) {
              setStagedAttachment({
                url,
                file,
                type: 'image',
                name: file.name || 'clipboard-image.png'
              });
            } else {
              addToast('error', 'Failed to upload image from clipboard');
            }
          } catch (err) {
            console.error('Error uploading pasted image:', err);
            addToast('error', 'Failed to upload image');
          } finally {
            setIsUploading(false);
          }
        }
        return;
      }
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' ' +
      date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-orange-400 animate-spin mx-auto mb-3" />
          <p className="text-zinc-400">Loading messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Chat Header */}
      <div className="p-6 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
            <User className="w-6 h-6 text-zinc-900" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Chat with Ben</h2>
            <p className="text-sm text-zinc-400">Bright Forge Account Manager</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <span className="text-sm text-zinc-400">Online</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                <Send className="w-8 h-8 text-zinc-500" />
              </div>
              <p className="text-zinc-400 font-medium">No messages yet</p>
              <p className="text-sm text-zinc-500 mt-1">Start a conversation with Ben</p>
            </div>
          </div>
        ) : (
          messages.map((message, index) => {
            const isPartner = message.sender_type === 'partner';
            const showAvatar =
              index === 0 || messages[index - 1].sender_type !== message.sender_type;

            return (
              <div
                key={message.id}
                className={`flex ${isPartner ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`flex gap-3 max-w-[80%] ${
                    isPartner ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  {showAvatar ? (
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isPartner
                          ? 'bg-orange-400 text-zinc-900'
                          : 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
                      }`}
                    >
                      <span className="text-xs font-semibold">
                        {isPartner
                          ? partnerAccount.company_name.slice(0, 2).toUpperCase()
                          : 'BF'}
                      </span>
                    </div>
                  ) : (
                    <div className="w-8" />
                  )}

                  <div>
                    {showAvatar && (
                      <p
                        className={`text-xs text-zinc-500 mb-1 ${
                          isPartner ? 'text-right' : 'text-left'
                        }`}
                      >
                        {message.sender_name}
                      </p>
                    )}

                    <div
                      className={`rounded-2xl px-4 py-3 ${
                        isPartner
                          ? 'bg-orange-400 text-zinc-900 rounded-tr-md'
                          : 'bg-zinc-800 text-white rounded-tl-md'
                      }`}
                    >
                      {message.attachment_url && (
                        <div className="mb-2">
                          {message.attachment_type === 'image' ? (
                            <img
                              src={message.attachment_url}
                              alt="Attachment"
                              className="max-w-full rounded-lg max-h-64 object-contain"
                            />
                          ) : (
                            <a
                              href={message.attachment_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`flex items-center gap-2 p-2 rounded-lg ${
                                isPartner ? 'bg-orange-500/30' : 'bg-zinc-700'
                              }`}
                            >
                              <File className="w-4 h-4" />
                              <span className="text-sm truncate">
                                {message.attachment_name || 'File'}
                              </span>
                            </a>
                          )}
                        </div>
                      )}
                      <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                    </div>

                    <div
                      className={`flex items-center gap-1 mt-1 ${
                        isPartner ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <span className="text-xs text-zinc-500">
                        {formatTime(message.created_at)}
                      </span>
                      {isPartner && (
                        <span className="text-zinc-500">
                          {message.is_read ? (
                            <CheckCheck className="w-3 h-3" />
                          ) : (
                            <Check className="w-3 h-3" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-zinc-800 bg-zinc-900/50">
        {/* Staged attachment preview */}
        {stagedAttachment && (
          <div className="relative mb-3 p-3 bg-zinc-800 rounded-xl">
            <div className="flex items-start gap-3">
              {stagedAttachment.type === 'image' ? (
                <img
                  src={stagedAttachment.url}
                  alt="Attachment preview"
                  className="max-h-32 max-w-[200px] rounded-lg object-contain"
                />
              ) : (
                <div className="flex items-center gap-2 p-2 bg-zinc-700 rounded-lg">
                  <File className="w-5 h-5 text-zinc-400" />
                  <span className="text-sm text-zinc-300">{stagedAttachment.name}</span>
                </div>
              )}
              <button
                onClick={() => setStagedAttachment(null)}
                className="absolute top-2 right-2 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
                title="Remove attachment"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Uploading indicator */}
        {isUploading && (
          <div className="mb-3 p-3 bg-zinc-800 rounded-xl flex items-center gap-2 text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Uploading...</span>
          </div>
        )}

        <div className="flex items-end gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending || isUploading}
            className="p-3 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors disabled:opacity-50"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          <div className="flex-1 relative">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              onPaste={handlePaste}
              placeholder="Type a message..."
              rows={1}
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-orange-400 resize-none max-h-32"
              style={{ minHeight: '48px' }}
            />
          </div>

          <button
            onClick={handleSend}
            disabled={isSending || isUploading || (!newMessage.trim() && !stagedAttachment)}
            className="p-3 bg-orange-400 hover:bg-orange-500 text-zinc-900 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClientPortalChat;
