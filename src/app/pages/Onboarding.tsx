import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Building2, Check, Globe, Zap, FileText, Users } from 'lucide-react';

interface OnboardingProps {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1);
  const [workspaceName, setWorkspaceName] = useState('My Workspace');
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [teamEmails, setTeamEmails] = useState(['']);

  const leadSources = [
    { id: 'website', name: 'Website', icon: Globe },
    { id: 'ads', name: 'Ads', icon: Zap },
    { id: 'whatsapp', name: 'WhatsApp', icon: FileText },
    { id: 'csv', name: 'CSV Import', icon: FileText },
    { id: 'manual', name: 'Manual Entry', icon: Users },
  ];

  const toggleSource = (sourceId: string) => {
    setSelectedSources(prev =>
      prev.includes(sourceId)
        ? prev.filter(id => id !== sourceId)
        : [...prev, sourceId]
    );
  };

  const handleNext = () => {
    if (step < 5) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Building2 className="h-8 w-8 text-blue-600" />
              <span className="text-2xl font-bold">Pulsar</span>
            </div>
            <div className="flex gap-2 justify-center mb-6">
              {[1, 2, 3, 4, 5].map((s) => (
                <div
                  key={s}
                  className={`w-12 h-2 rounded-full ${
                    s <= step ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
            <p className="text-sm text-gray-600">Step {step} of 5</p>
          </div>

          {/* Step 1: Welcome */}
          {step === 1 && (
            <div className="text-center space-y-6">
              <h1 className="text-3xl font-bold">Welcome to Pulsar! 👋</h1>
              <p className="text-lg text-gray-600">
                Let's get you set up in just a few steps. This will only take 2 minutes.
              </p>
              <div className="flex justify-center gap-8 py-8">
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Building2 className="h-8 w-8 text-blue-600" />
                  </div>
                  <p className="text-sm">Setup Workspace</p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Globe className="h-8 w-8 text-blue-600" />
                  </div>
                  <p className="text-sm">Choose Sources</p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Users className="h-8 w-8 text-blue-600" />
                  </div>
                  <p className="text-sm">Invite Team</p>
                </div>
              </div>
              <Button onClick={handleNext} size="lg" className="px-12">
                Get Started
              </Button>
              <button onClick={onComplete} className="block mx-auto text-sm text-gray-500 hover:underline">
                Skip for now
              </button>
            </div>
          )}

          {/* Step 2: Workspace Setup */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">Setup Your Workspace</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="workspace">Workspace Name</Label>
                  <Input
                    id="workspace"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    placeholder="My Sales Team"
                  />
                  <p className="text-sm text-gray-500">
                    URL: pulsar.com/{workspaceName.toLowerCase().replace(/\s+/g, '-')}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <select
                    id="industry"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option>Technology</option>
                    <option>Finance</option>
                    <option>Healthcare</option>
                    <option>Retail</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Primary Goal</Label>
                  <div className="space-y-2">
                    {['Generate more leads', 'Close more deals', 'Improve team collaboration', 'Better reporting'].map(goal => (
                      <label key={goal} className="flex items-center space-x-2 cursor-pointer">
                        <input type="radio" name="goal" className="text-blue-600" />
                        <span>{goal}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <Button onClick={handleNext} className="w-full">
                Continue
              </Button>
            </div>
          )}

          {/* Step 3: Lead Sources */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">Choose Your Lead Sources</h2>
              <p className="text-gray-600">Select where your leads will come from</p>
              <div className="grid grid-cols-2 gap-4">
                {leadSources.map(source => {
                  const Icon = source.icon;
                  const isSelected = selectedSources.includes(source.id);
                  return (
                    <button
                      key={source.id}
                      onClick={() => toggleSource(source.id)}
                      className={`p-6 border-2 rounded-lg text-center transition-all ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <Icon className={`h-8 w-8 mx-auto mb-2 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
                      <div className="font-semibold">{source.name}</div>
                      {isSelected && (
                        <Check className="h-5 w-5 text-blue-600 mx-auto mt-2" />
                      )}
                    </button>
                  );
                })}
              </div>
              <Button onClick={handleNext} className="w-full">
                Continue
              </Button>
            </div>
          )}

          {/* Step 4: Team Setup */}
          {step === 4 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">Invite Your Team</h2>
              <p className="text-gray-600">Add team members to collaborate on leads</p>
              <div className="space-y-4">
                {teamEmails.map((email, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="teammate@company.com"
                      value={email}
                      onChange={(e) => {
                        const newEmails = [...teamEmails];
                        newEmails[index] = e.target.value;
                        setTeamEmails(newEmails);
                      }}
                      className="flex-1"
                    />
                    <select className="px-3 py-2 border border-gray-300 rounded-md">
                      <option>Admin</option>
                      <option>Member</option>
                      <option>Viewer</option>
                    </select>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTeamEmails([...teamEmails, ''])}
                  className="w-full"
                >
                  + Add Another
                </Button>
              </div>
              <div className="flex gap-4">
                <Button variant="outline" onClick={handleNext} className="flex-1">
                  Skip for Now
                </Button>
                <Button onClick={handleNext} className="flex-1">
                  Invite & Continue
                </Button>
              </div>
            </div>
          )}

          {/* Step 5: Automation Preferences */}
          {step === 5 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">Automation Preferences</h2>
              <p className="text-gray-600">Configure how Pulsar helps you work smarter</p>
              <div className="space-y-4">
                <div className="flex items-start justify-between p-4 border rounded-lg">
                  <div>
                    <div className="font-semibold">Auto-respond to New Leads</div>
                    <div className="text-sm text-gray-500">Send automatic welcome messages</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <div className="flex items-start justify-between p-4 border rounded-lg">
                  <div>
                    <div className="font-semibold">Auto-assign Leads</div>
                    <div className="text-sm text-gray-500">Distribute leads to team members</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <div className="flex items-start justify-between p-4 border rounded-lg">
                  <div>
                    <div className="font-semibold">Follow-up Reminders</div>
                    <div className="text-sm text-gray-500">Get notified when it's time to follow up</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
              <Button onClick={onComplete} className="w-full" size="lg">
                Go to Dashboard
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
