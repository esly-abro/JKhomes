import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Users, Check, X, Shield, AlertCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '../context/ToastContext';
import { parseApiError } from '../lib/parseApiError';

interface PendingUser {
  _id: string;
  email: string;
  name: string;
  phone?: string;
  role: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export default function UserManagement() {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const { addToast } = useToast();

  useEffect(() => {
    fetchPendingUsers();
  }, []);

  const fetchPendingUsers = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/users/pending', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch pending users');
      }

      const data = await response.json();
      setPendingUsers(data.data);
    } catch (err: any) {
      addToast(parseApiError(err).message, 'error');
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId: string) => {
    setProcessing(userId);
    setError('');

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/users/${userId}/approve`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        throw new Error('Failed to approve user');
      }

      // Remove from pending list
      setPendingUsers(prev => prev.filter(user => user._id !== userId));
      addToast('User approved successfully!', 'success');
    } catch (err: any) {
      addToast(parseApiError(err).message, 'error');
      setError(err.message);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (userId: string) => {
    const reason = prompt('Enter rejection reason (optional):');
    
    setProcessing(userId);
    setError('');

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/users/${userId}/reject`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason })
      });

      if (!response.ok) {
        throw new Error('Failed to reject user');
      }

      // Remove from pending list
      setPendingUsers(prev => prev.filter(user => user._id !== userId));
      addToast('User rejected', 'success');
    } catch (err: any) {
      addToast(parseApiError(err).message, 'error');
      setError(err.message);
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
        </div>
        <p className="text-gray-600">Review and approve new agent registrations</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {pendingUsers.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Pending Approvals</h2>
          <p className="text-gray-600">All new agent registrations have been processed.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Phone
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Registered
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {pendingUsers.map((user) => (
                <tr key={user._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{user.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{user.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{user.phone || '—'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {format(new Date(user.createdAt), 'MMM d, yyyy')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleApprove(user._id)}
                        disabled={processing === user._id}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {processing === user._id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Check className="h-4 w-4 mr-1" />
                            Approve
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReject(user._id)}
                        disabled={processing === user._id}
                        className="border-red-300 text-red-600 hover:bg-red-50"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
