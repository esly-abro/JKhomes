/**
 * WhatsApp Template Builder Component
 * 
 * Allows org admins to create, edit, submit for approval, and manage
 * WhatsApp message templates for use in automations.
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Send,
  FileText,
  Eye,
  Pencil,
  X,
  MessageSquare,
} from 'lucide-react';
import {
  listOrgTemplates,
  createOrgTemplate,
  updateOrgTemplate,
  deleteOrgTemplate,
  submitOrgTemplate,
  syncOrgTemplates,
  type WhatsAppTemplateRecord,
} from '../../../services/whatsapp';

// ─────────────────────────────────────────────
// Status badge colors
// ─────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700 border-gray-300',
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    approved: 'bg-green-100 text-green-700 border-green-300',
    rejected: 'bg-red-100 text-red-700 border-red-300',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.draft}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─────────────────────────────────────────────
// Phone preview
// ─────────────────────────────────────────────

function PhonePreview({
  headerText,
  body,
  footer,
  buttons,
}: {
  headerText: string;
  body: string;
  footer: string;
  buttons: Array<{ text: string }>;
}) {
  return (
    <div className="bg-gray-100 rounded-2xl p-4 max-w-xs mx-auto">
      {/* WhatsApp-style bubble */}
      <div className="bg-white rounded-lg shadow-sm p-3 space-y-1">
        {headerText && (
          <div className="font-semibold text-gray-900 text-sm">{headerText}</div>
        )}
        <div className="text-sm text-gray-800 whitespace-pre-wrap">{body || 'Your message body here...'}</div>
        {footer && (
          <div className="text-xs text-gray-500 mt-1">{footer}</div>
        )}
        <div className="text-xs text-gray-400 text-right mt-1">12:00 PM ✓✓</div>
      </div>
      {/* Quick reply buttons */}
      {buttons.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {buttons.map((btn, i) => (
            <button
              key={i}
              className="flex-1 min-w-[80px] py-1.5 px-3 rounded-lg bg-white border border-gray-200 text-sm text-blue-600 font-medium text-center shadow-sm"
            >
              {btn.text || `Button ${i + 1}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export default function TemplateBuilder() {
  const [templates, setTemplates] = useState<WhatsAppTemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Create/Edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplateRecord | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    friendlyName: '',
    category: 'UTILITY' as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
    language: 'en',
    contentType: 'text' as 'text' | 'quick-reply',
    headerText: '',
    body: '',
    footer: '',
    buttons: [] as Array<{ type: string; text: string }>,
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<WhatsAppTemplateRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Submitting
  const [submitting, setSubmitting] = useState<string | null>(null);

  // ─── Data loading ───

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listOrgTemplates(filterStatus !== 'all' ? filterStatus : undefined);
      setTemplates(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // ─── Sync from Twilio ───

  const handleSync = async () => {
    try {
      setSyncing(true);
      setSyncResult(null);
      const result = await syncOrgTemplates();
      setSyncResult(
        `Synced! ${result.approved} approved, ${result.rejected} rejected, ${result.imported} imported from Twilio`
      );
      await loadTemplates();
    } catch (err: any) {
      setSyncResult(`Sync failed: ${err?.response?.data?.error || err?.message}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(null), 6000);
    }
  };

  // ─── Create/Edit dialog handlers ───

  const openCreateDialog = () => {
    setEditingTemplate(null);
    setFormData({
      name: '',
      friendlyName: '',
      category: 'UTILITY',
      language: 'en',
      contentType: 'text',
      headerText: '',
      body: '',
      footer: '',
      buttons: [],
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (template: WhatsAppTemplateRecord) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      friendlyName: template.friendlyName,
      category: template.category,
      language: template.language,
      contentType: template.contentType === 'card' ? 'quick-reply' : template.contentType,
      headerText: template.headerText || '',
      body: template.body,
      footer: template.footer || '',
      buttons: (template.buttons || []).map(b => ({ type: b.type, text: b.text })),
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (!formData.name.trim() || !formData.body.trim()) {
      setFormError('Template name and message body are required');
      return;
    }

    try {
      setSaving(true);
      setFormError(null);

      if (editingTemplate) {
        await updateOrgTemplate(editingTemplate._id, {
          friendlyName: formData.friendlyName || formData.name,
          category: formData.category,
          language: formData.language,
          contentType: formData.contentType,
          headerText: formData.headerText,
          body: formData.body,
          footer: formData.footer,
          buttons: formData.buttons,
        });
      } else {
        await createOrgTemplate({
          name: formData.name,
          friendlyName: formData.friendlyName || formData.name,
          category: formData.category,
          language: formData.language,
          contentType: formData.contentType,
          headerText: formData.headerText,
          body: formData.body,
          footer: formData.footer,
          buttons: formData.buttons,
        });
      }

      setDialogOpen(false);
      await loadTemplates();
    } catch (err: any) {
      setFormError(err?.response?.data?.error || err?.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  // ─── Button management ───

  const addButton = () => {
    if (formData.buttons.length >= 3) return;
    setFormData(prev => ({
      ...prev,
      contentType: 'quick-reply',
      buttons: [...prev.buttons, { type: 'QUICK_REPLY', text: '' }],
    }));
  };

  const removeButton = (index: number) => {
    setFormData(prev => {
      const newButtons = prev.buttons.filter((_, i) => i !== index);
      return {
        ...prev,
        buttons: newButtons,
        contentType: newButtons.length > 0 ? 'quick-reply' : 'text',
      };
    });
  };

  const updateButtonText = (index: number, text: string) => {
    setFormData(prev => {
      const newButtons = [...prev.buttons];
      newButtons[index] = { ...newButtons[index], text };
      return { ...prev, buttons: newButtons };
    });
  };

  // ─── Submit for approval ───

  const handleSubmit = async (templateId: string) => {
    try {
      setSubmitting(templateId);
      await submitOrgTemplate(templateId);
      await loadTemplates();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to submit template');
      setTimeout(() => setError(null), 5000);
    } finally {
      setSubmitting(null);
    }
  };

  // ─── Delete ───

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await deleteOrgTemplate(deleteTarget._id);
      setDeleteTarget(null);
      await loadTemplates();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to delete template');
      setTimeout(() => setError(null), 5000);
    } finally {
      setDeleting(false);
    }
  };

  // ─── Auto-generate name from friendly name ───
  const handleFriendlyNameChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      friendlyName: value,
      name: editingTemplate
        ? prev.name
        : value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/^[^a-z]/, 'tpl_'),
    }));
  };

  // ─── Render ───

  return (
    <>
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-green-600" />
                WhatsApp Templates
              </CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Create message templates, submit them for approval, and use them in automations
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={syncing}
              >
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-1.5">Sync from Twilio</span>
              </Button>
              <Button
                size="sm"
                onClick={openCreateDialog}
                className="bg-green-600 hover:bg-green-700"
              >
                <Plus className="h-4 w-4 mr-1" />
                New Template
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sync result message */}
          {syncResult && (
            <div className={`p-3 rounded-lg text-sm ${
              syncResult.startsWith('Sync failed')
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-green-50 text-green-700 border border-green-200'
            }`}>
              {syncResult}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 border border-red-200 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Status filter */}
          <div className="flex gap-2">
            {['all', 'draft', 'pending', 'approved', 'rejected'].map(status => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filterStatus === status
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading templates...
            </div>
          )}

          {/* Empty state */}
          {!loading && templates.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <MessageSquare className="h-10 w-10 mx-auto text-gray-300 mb-3" />
              <p className="font-medium text-gray-700">No templates yet</p>
              <p className="text-sm mt-1">Create your first WhatsApp template to use in automations</p>
              <Button
                onClick={openCreateDialog}
                className="mt-4 bg-green-600 hover:bg-green-700"
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                Create Template
              </Button>
            </div>
          )}

          {/* Template list */}
          {!loading && templates.length > 0 && (
            <div className="space-y-3">
              {templates.map(template => (
                <div
                  key={template._id}
                  className="border rounded-lg p-4 bg-white hover:border-green-200 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-gray-900 truncate">{template.friendlyName}</h4>
                        <StatusBadge status={template.status} />
                        <span className="text-xs text-gray-400 font-mono">{template.name}</span>
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2 mt-0.5">{template.body}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        <span>{template.category}</span>
                        <span>·</span>
                        <span>{template.language}</span>
                        {template.buttons.length > 0 && (
                          <>
                            <span>·</span>
                            <span>{template.buttons.length} button{template.buttons.length > 1 ? 's' : ''}</span>
                          </>
                        )}
                        {template.twilioContentSid && (
                          <>
                            <span>·</span>
                            <span className="font-mono">{template.twilioContentSid}</span>
                          </>
                        )}
                        <span>·</span>
                        <span>{new Date(template.createdAt).toLocaleDateString()}</span>
                      </div>
                      {template.status === 'rejected' && template.rejectedReason && (
                        <div className="mt-2 text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                          Rejected: {template.rejectedReason}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 ml-4">
                      {(template.status === 'draft' || template.status === 'rejected') && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialog(template)}
                            className="h-8 w-8 p-0"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSubmit(template._id)}
                            disabled={submitting === template._id}
                            className="h-8 px-3 text-green-600 border-green-200 hover:bg-green-50"
                            title="Submit for Approval"
                          >
                            {submitting === template._id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <>
                                <Send className="h-3.5 w-3.5 mr-1" />
                                Submit
                              </>
                            )}
                          </Button>
                        </>
                      )}
                      {template.status === 'approved' && (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Ready
                        </span>
                      )}
                      {template.status === 'pending' && (
                        <span className="text-xs text-yellow-600 flex items-center gap-1">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Reviewing...
                        </span>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteTarget(template)}
                        className="h-8 w-8 p-0 text-red-500 border-red-200 hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Create/Edit Dialog ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Edit Template' : 'Create New Template'}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? 'Update your template. Only draft or rejected templates can be edited.'
                : 'Create a WhatsApp message template. After creating, submit it for approval to use in automations.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left column — Form */}
            <div className="space-y-4">
              {/* Friendly Name */}
              <div className="space-y-1.5">
                <Label htmlFor="tpl-friendly-name" className="text-sm font-medium">
                  Template Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="tpl-friendly-name"
                  placeholder="e.g., Welcome Message"
                  value={formData.friendlyName}
                  onChange={(e) => handleFriendlyNameChange(e.target.value)}
                />
                <p className="text-xs text-gray-400">
                  ID: <span className="font-mono">{formData.name || '...'}</span>
                </p>
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Category</Label>
                <div className="flex gap-2">
                  {(['UTILITY', 'MARKETING'] as const).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, category: cat }))}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                        formData.category === cat
                          ? 'bg-green-50 border-green-300 text-green-700'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Language */}
              <div className="space-y-1.5">
                <Label htmlFor="tpl-language" className="text-sm font-medium">Language</Label>
                <select
                  id="tpl-language"
                  value={formData.language}
                  onChange={(e) => setFormData(prev => ({ ...prev, language: e.target.value }))}
                  className="w-full h-9 px-3 rounded-md border border-gray-200 text-sm bg-white"
                >
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="ta">Tamil</option>
                  <option value="te">Telugu</option>
                  <option value="kn">Kannada</option>
                  <option value="ml">Malayalam</option>
                  <option value="mr">Marathi</option>
                  <option value="gu">Gujarati</option>
                  <option value="bn">Bengali</option>
                </select>
              </div>

              {/* Header (optional) */}
              <div className="space-y-1.5">
                <Label htmlFor="tpl-header" className="text-sm font-medium">Header <span className="text-gray-400 text-xs">(optional)</span></Label>
                <Input
                  id="tpl-header"
                  placeholder="e.g., Welcome to JK Homes!"
                  maxLength={60}
                  value={formData.headerText}
                  onChange={(e) => setFormData(prev => ({ ...prev, headerText: e.target.value }))}
                />
              </div>

              {/* Body */}
              <div className="space-y-1.5">
                <Label htmlFor="tpl-body" className="text-sm font-medium">
                  Message Body <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="tpl-body"
                  placeholder="Hi {{1}}! Thank you for your interest in our properties. We'd love to help you find your dream home..."
                  rows={5}
                  maxLength={1024}
                  value={formData.body}
                  onChange={(e) => setFormData(prev => ({ ...prev, body: e.target.value }))}
                  className="min-h-[120px]"
                />
                <p className="text-xs text-gray-400">{formData.body.length}/1024 • Use {'{{1}}'}, {'{{2}}'} for variables</p>
              </div>

              {/* Footer (optional) */}
              <div className="space-y-1.5">
                <Label htmlFor="tpl-footer" className="text-sm font-medium">Footer <span className="text-gray-400 text-xs">(optional)</span></Label>
                <Input
                  id="tpl-footer"
                  placeholder="e.g., Reply STOP to unsubscribe"
                  maxLength={60}
                  value={formData.footer}
                  onChange={(e) => setFormData(prev => ({ ...prev, footer: e.target.value }))}
                />
              </div>

              {/* Quick Reply Buttons */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Quick Reply Buttons <span className="text-gray-400 text-xs">(max 3)</span></Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addButton}
                    disabled={formData.buttons.length >= 3}
                    className="h-7 text-xs"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Button
                  </Button>
                </div>
                {formData.buttons.map((btn, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      placeholder={`Button ${i + 1} text`}
                      maxLength={25}
                      value={btn.text}
                      onChange={(e) => updateButtonText(i, e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeButton(i)}
                      className="h-8 w-8 p-0 text-red-500 hover:bg-red-50"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Right column — Preview */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5" />
                Preview
              </Label>
              <PhonePreview
                headerText={formData.headerText}
                body={formData.body}
                footer={formData.footer}
                buttons={formData.buttons}
              />
              <div className="text-xs text-gray-400 text-center mt-2">
                This is an approximate preview. Final rendering may differ on WhatsApp.
              </div>
            </div>
          </div>

          {formError && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 border border-red-200 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {formError}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveTemplate}
              disabled={saving || !formData.name.trim() || !formData.body.trim()}
              className="bg-green-600 hover:bg-green-700"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  {editingTemplate ? 'Update Template' : 'Create Template'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation Dialog ─── */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTarget?.friendlyName}"?
              {deleteTarget?.twilioContentSid && (
                <span className="block mt-1 text-red-600">
                  This will also remove the template from your Twilio account.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
