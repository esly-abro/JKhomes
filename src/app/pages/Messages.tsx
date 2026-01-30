import { useState } from 'react';
import { useData } from '../context/DataContext';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Search, Send, MoreVertical, Phone, Video } from 'lucide-react';
import { Badge } from '../components/ui/badge';

export default function Messages() {
  const { messages, leads } = useData();
  const [selectedConversation, setSelectedConversation] = useState(messages[0]);
  const [messageText, setMessageText] = useState('');

  const lead = leads.find(l => l.id === selectedConversation?.leadId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Messages</h1>
        <p className="text-gray-600">Communicate with your leads in real-time</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-250px)]">
        {/* Conversations List */}
        <Card className="lg:col-span-1 p-4 overflow-y-auto">
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input placeholder="Search conversations..." className="pl-10" />
            </div>

            <div className="space-y-2">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  onClick={() => setSelectedConversation(msg)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedConversation?.id === msg.id
                      ? 'bg-blue-50 border-2 border-blue-600'
                      : 'hover:bg-gray-50 border-2 border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm">{msg.leadName}</span>
                    {msg.unread && (
                      <Badge className="bg-blue-600 text-white text-xs">New</Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 truncate">{msg.lastMessage}</p>
                  <span className="text-xs text-gray-500">{msg.timestamp}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Chat Thread */}
        <Card className="lg:col-span-2 flex flex-col">
          {/* Chat Header */}
          <div className="p-4 border-b flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{selectedConversation?.leadName}</h3>
              <p className="text-sm text-gray-600">{lead?.email}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="icon">
                <Phone className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon">
                <Video className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {selectedConversation?.messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] p-3 rounded-lg ${
                    msg.sender === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <p>{msg.text}</p>
                  <span className={`text-xs ${msg.sender === 'user' ? 'text-blue-100' : 'text-gray-500'}`}>
                    {msg.timestamp}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Message Input */}
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <Input
                placeholder="Type a message..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    setMessageText('');
                  }
                }}
              />
              <Button>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>

        {/* Lead Quick View */}
        <Card className="p-4">
          <h3 className="font-semibold mb-4">Lead Information</h3>
          {lead && (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-600">Name</label>
                <div className="font-semibold">{lead.name}</div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Company</label>
                <div>{lead.company}</div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Email</label>
                <div className="text-sm">{lead.email}</div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Phone</label>
                <div className="text-sm">{lead.phone}</div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Status</label>
                <Badge className="mt-1">{lead.status}</Badge>
              </div>
              <div>
                <label className="text-sm text-gray-600">Deal Value</label>
                <div className="text-lg font-bold">${lead.value.toLocaleString()}</div>
              </div>
              <Button variant="outline" className="w-full">View Full Profile</Button>
            </div>
          )}

          <div className="mt-6">
            <h4 className="font-semibold mb-2">Quick Templates</h4>
            <div className="space-y-2">
              <Button variant="outline" size="sm" className="w-full text-left justify-start text-sm">
                Follow-up message
              </Button>
              <Button variant="outline" size="sm" className="w-full text-left justify-start text-sm">
                Meeting request
              </Button>
              <Button variant="outline" size="sm" className="w-full text-left justify-start text-sm">
                Pricing info
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
