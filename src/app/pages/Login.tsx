import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { Building2 } from 'lucide-react';
import { login, User } from '../../services/auth';

interface LoginProps {
  onLogin: (user: User) => void | Promise<void>;
}

export default function Login({ onLogin }: LoginProps) {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    searchParams.get('reason') === 'inactive'
      ? 'You were logged out due to inactivity. Please log in again.'
      : ''
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setLoading(true);
      setError('');
      const user = await login(email, password);
      await onLogin(user);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Column - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 to-purple-700 p-12 flex-col justify-between text-white">
        <div>
          <div className="flex items-center gap-2 mb-8">
            <Building2 className="h-8 w-8" />
            <span className="text-2xl font-bold">Pulsar</span>
          </div>
          <h1 className="text-4xl font-bold mb-6">
            Manage Your Leads, <br />Close More Deals
          </h1>
          <p className="text-xl opacity-90">
            The all-in-one platform for modern sales teams to track, nurture, and convert leads into customers.
          </p>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">✓</div>
            <div>
              <div className="font-semibold">360° Lead View</div>
              <div className="text-sm opacity-75">Complete lead history and insights</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">✓</div>
            <div>
              <div className="font-semibold">Smart Automation</div>
              <div className="text-sm opacity-75">Auto-assign and follow-up reminders</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">✓</div>
            <div>
              <div className="font-semibold">Real-time Analytics</div>
              <div className="text-sm opacity-75">Track performance and conversions</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Log in</h2>
              <p className="text-gray-600">Welcome back! Please enter your details.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Checkbox id="remember" />
                  <label htmlFor="remember" className="text-sm text-gray-700 cursor-pointer">
                    Remember me
                  </label>
                </div>
                <Link to="/forgot-password" className="text-sm text-blue-600 hover:underline">
                  Forgot password?
                </Link>
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? 'Logging in...' : 'Log in'}
              </Button>
            </form>

            <p className="mt-8 text-center text-sm text-gray-600">
              Don't have an organization?{' '}
              <Link to="/signup" className="font-semibold text-blue-600 hover:underline">
                Register new organization
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
