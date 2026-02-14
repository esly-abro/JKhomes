/**
 * Automation Monitor Page
 *
 * Shows all leads that entered a specific automation workflow and their current stage.
 * Accessible via the "Monitor" button on saved automations.
 *
 * Features:
 *   - List of all runs (leads) for the automation with status badges
 *   - Expand/view button shows the full execution path (which node, what happened)
 *   - Error/stuck reasons clearly displayed
 *   - Auto-refresh every 10 seconds for live monitoring
 *   - Cancel button for running/stuck automations
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, ChevronDown, ChevronRight, XCircle,
  CheckCircle2, Clock, AlertTriangle, Loader2, Pause, Ban,
  User, Phone, Mail, Eye, Activity,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import {
  getAutomation,
  getAutomationRuns,
  getAutomationRun,
  cancelAutomationRun,
  getRunExecutionLogs,
} from '../../services/automations';
import type { Automation, AutomationRun, ExecutionLogEntry } from '../../services/automations';

// ─── Status Helpers ─────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  running:              { label: 'Running',          color: 'text-blue-700',   bgColor: 'bg-blue-100',   icon: Loader2 },
  completed:            { label: 'Completed',        color: 'text-green-700',  bgColor: 'bg-green-100',  icon: CheckCircle2 },
  failed:               { label: 'Failed',           color: 'text-red-700',    bgColor: 'bg-red-100',    icon: XCircle },
  paused:               { label: 'Paused',           color: 'text-yellow-700', bgColor: 'bg-yellow-100', icon: Pause },
  cancelled:            { label: 'Cancelled',        color: 'text-gray-700',   bgColor: 'bg-gray-100',   icon: Ban },
  waiting_for_response: { label: 'Waiting Response', color: 'text-purple-700', bgColor: 'bg-purple-100', icon: Clock },
  waiting_for_task:     { label: 'Waiting Task',     color: 'text-indigo-700', bgColor: 'bg-indigo-100', icon: Clock },
};

const STEP_STATUS_CONFIG: Record<string, { color: string; dotColor: string }> = {
  pending:   { color: 'text-gray-500',   dotColor: 'bg-gray-300' },
  running:   { color: 'text-blue-600',   dotColor: 'bg-blue-500' },
  completed: { color: 'text-green-600',  dotColor: 'bg-green-500' },
  failed:    { color: 'text-red-600',    dotColor: 'bg-red-500' },
  skipped:   { color: 'text-gray-400',   dotColor: 'bg-gray-300' },
  waiting:   { color: 'text-purple-600', dotColor: 'bg-purple-500' },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || { label: status, color: 'text-gray-700', bgColor: 'bg-gray-100', icon: Activity };
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}>
      <Icon className={`h-3 w-3 ${status === 'running' ? 'animate-spin' : ''}`} />
      {config.label}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Execution Path Timeline ────────────────────────────────────

function ExecutionTimeline({ run, logs }: { run: AutomationRun; logs: ExecutionLogEntry[] }) {
  const steps = run.executionPath || [];

  if (steps.length === 0) {
    return <div className="text-sm text-gray-400 italic py-2">No execution steps recorded yet</div>;
  }

  return (
    <div className="space-y-0">
      {steps.map((step, idx) => {
        const stepConfig = STEP_STATUS_CONFIG[step.status] || STEP_STATUS_CONFIG.pending;
        const isLast = idx === steps.length - 1;
        const isStuck = isLast && (step.status === 'failed' || step.status === 'waiting');
        // Find matching execution logs for richer detail
        const stepLogs = logs.filter(l => l.nodeId === step.nodeId);
        const lastLog = stepLogs[stepLogs.length - 1];

        return (
          <div key={`${step.nodeId}-${idx}`} className="flex gap-3">
            {/* Vertical line + dot */}
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${stepConfig.dotColor} ${
                step.status === 'running' ? 'animate-pulse ring-2 ring-blue-200' : ''
              } ${step.status === 'waiting' ? 'animate-pulse ring-2 ring-purple-200' : ''}`} />
              {!isLast && <div className="w-0.5 flex-1 bg-gray-200 my-1" />}
            </div>

            {/* Content */}
            <div className={`flex-1 pb-4 ${isLast ? '' : ''}`}>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${stepConfig.color}`}>
                  {step.nodeLabel || step.nodeId}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-mono">
                  {step.nodeType}
                </span>
                <span className={`text-[10px] font-medium ${stepConfig.color}`}>
                  {step.status}
                </span>
              </div>

              {/* Timing */}
              {step.startedAt && (
                <div className="text-[11px] text-gray-400 mt-0.5">
                  Started {timeAgo(step.startedAt)}
                  {step.completedAt && ` · Completed ${timeAgo(step.completedAt)}`}
                  {lastLog?.duration && ` · ${lastLog.duration}ms`}
                </div>
              )}

              {/* Error message — highlighted for stuck nodes */}
              {(step.error || (isStuck && run.error)) && (
                <div className="mt-1 px-2 py-1.5 rounded bg-red-50 border border-red-200">
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs font-medium text-red-700">
                        {step.status === 'failed' ? 'Failed' : 'Stuck'} at this step
                      </div>
                      <div className="text-xs text-red-600 mt-0.5">
                        {step.error || run.error}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Waiting info */}
              {step.status === 'waiting' && (
                <div className="mt-1 px-2 py-1.5 rounded bg-purple-50 border border-purple-200">
                  <div className="flex items-start gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-purple-500 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-purple-700">
                      Waiting for {run.waitingForCall?.isWaiting ? 'AI call result' :
                        run.waitingForResponse?.isWaiting ? 'WhatsApp response' : 'external input'}
                      {(run.waitingForCall?.timeoutAt || run.waitingForResponse?.timeoutAt) && (
                        <span className="text-purple-500">
                          {' '}· Timeout at {new Date(
                            (run.waitingForCall?.timeoutAt || run.waitingForResponse?.timeoutAt)!
                          ).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Execution log detail */}
              {lastLog?.message && !step.error && step.status !== 'waiting' && (
                <div className="text-[11px] text-gray-500 mt-0.5">{lastLog.message}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Run Row ────────────────────────────────────────────────────

function RunRow({ run: initialRun, onCancel }: { run: AutomationRun; onCancel: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [run, setRun] = useState(initialRun);
  const [logs, setLogs] = useState<ExecutionLogEntry[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Update if parent re-fetches
  useEffect(() => {
    setRun(initialRun);
  }, [initialRun]);

  const handleExpand = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    setLoadingDetail(true);
    try {
      const [detail, logData] = await Promise.all([
        getAutomationRun(run._id),
        getRunExecutionLogs(run._id).catch(() => []),
      ]);
      setRun(detail);
      setLogs(logData);
    } catch {
      // Use existing data
    } finally {
      setLoadingDetail(false);
    }
  };

  const lead = run.lead;
  const leadName = typeof lead === 'object' ? lead.name : 'Unknown Lead';
  const leadPhone = typeof lead === 'object' ? lead.phone : '';
  const leadEmail = typeof lead === 'object' ? lead.email : '';

  // Determine current step
  const executionPath = run.executionPath || [];
  const currentStep = [...executionPath].reverse().find(s => s.status === 'running' || s.status === 'waiting')
    || executionPath[executionPath.length - 1];
  const progress = executionPath.length > 0
    ? Math.round((executionPath.filter(s => s.status === 'completed').length / executionPath.length) * 100)
    : 0;

  const isActive = ['running', 'waiting_for_response', 'waiting_for_task', 'paused'].includes(run.status);

  return (
    <div className="border rounded-lg bg-white">
      {/* Row header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={handleExpand}
      >
        {/* Expand icon */}
        <div className="text-gray-400">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>

        {/* Lead info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-800 truncate">{leadName}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {leadPhone && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Phone className="h-3 w-3" /> {leadPhone}
              </span>
            )}
            {leadEmail && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Mail className="h-3 w-3" /> {leadEmail}
              </span>
            )}
          </div>
        </div>

        {/* Current step */}
        <div className="hidden sm:block text-right min-w-[140px]">
          {currentStep ? (
            <div className="text-xs text-gray-600 truncate">
              {currentStep.status === 'waiting' ? '⏸️' : currentStep.status === 'running' ? '⚙️' : ''}
              {' '}{currentStep.nodeLabel || currentStep.nodeId}
            </div>
          ) : (
            <div className="text-xs text-gray-400">—</div>
          )}
          <div className="text-[11px] text-gray-400 mt-0.5">{timeAgo(run.createdAt)}</div>
        </div>

        {/* Progress bar */}
        <div className="hidden md:flex items-center gap-2 min-w-[100px]">
          <div className="flex-1 bg-gray-200 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${
                run.status === 'failed' ? 'bg-red-500' :
                run.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${run.status === 'completed' ? 100 : progress}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-400 w-8 text-right">
            {run.status === 'completed' ? '100' : progress}%
          </span>
        </div>

        {/* Status badge */}
        <StatusBadge status={run.status} />

        {/* Cancel button */}
        {isActive && (
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 px-2"
            onClick={(e) => { e.stopPropagation(); onCancel(run._id); }}
          >
            <XCircle className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t px-4 py-3 bg-gray-50/50">
          {loadingDetail ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-4 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading execution details...
            </div>
          ) : (
            <div>
              {/* Run error banner */}
              {run.error && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-red-800">Run Failed</div>
                      <div className="text-xs text-red-600 mt-0.5">{run.error}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Execution path timeline */}
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Execution Path
              </div>
              <ExecutionTimeline run={run} logs={logs} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Monitor Page ──────────────────────────────────────────

export default function AutomationMonitor() {
  const { automationId } = useParams<{ automationId: string }>();
  const navigate = useNavigate();

  const [automation, setAutomation] = useState<Automation | null>(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchData = useCallback(async (showLoading = true) => {
    if (!automationId) return;
    if (showLoading) setLoading(true);
    else setRefreshing(true);

    try {
      const [autoData, runsData] = await Promise.all([
        automation ? Promise.resolve(automation) : getAutomation(automationId),
        getAutomationRuns(automationId, page, 50),
      ]);
      setAutomation(autoData);
      setRuns(runsData.data);
      setTotalPages(runsData.pagination.pages);
      setTotal(runsData.pagination.total);
    } catch (err) {
      console.error('Failed to fetch automation data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [automationId, page, automation]);

  // Initial load
  useEffect(() => {
    fetchData(true);
  }, [automationId, page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => fetchData(false), 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleCancel = async (runId: string) => {
    if (!confirm('Cancel this automation run?')) return;
    try {
      await cancelAutomationRun(runId);
      fetchData(false);
    } catch (err) {
      console.error('Failed to cancel run:', err);
    }
  };

  // Filter runs by status
  const filteredRuns = statusFilter === 'all'
    ? runs
    : runs.filter(r => r.status === statusFilter);

  // Counts by status
  const statusCounts = runs.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/automation')}
            className="gap-1"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>

          <div className="flex-1">
            <h1 className="text-lg font-semibold text-gray-800">
              {automation?.name || 'Automation'} — Monitor
            </h1>
            <p className="text-sm text-gray-500">
              {total} total run{total !== 1 ? 's' : ''} · {statusCounts.running || 0} active · {statusCounts.completed || 0} completed · {statusCounts.failed || 0} failed
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(false)}
            disabled={refreshing}
            className="gap-1"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1 mt-3">
          {[
            { key: 'all', label: 'All', count: total },
            { key: 'running', label: 'Running', count: statusCounts.running || 0 },
            { key: 'waiting_for_response', label: 'Waiting', count: (statusCounts.waiting_for_response || 0) + (statusCounts.waiting_for_task || 0) },
            { key: 'completed', label: 'Completed', count: statusCounts.completed || 0 },
            { key: 'failed', label: 'Failed', count: statusCounts.failed || 0 },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                setStatusFilter(tab.key);
                if (tab.key === 'waiting_for_response') {
                  // Also show waiting_for_task
                }
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === tab.key
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      {/* Runs list */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredRuns.length === 0 ? (
          <div className="text-center py-16">
            <Activity className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <div className="text-gray-500 text-sm">
              {statusFilter !== 'all'
                ? `No ${statusFilter.replace(/_/g, ' ')} runs`
                : 'No leads have entered this automation yet'}
            </div>
            <div className="text-gray-400 text-xs mt-1">
              Runs will appear here when leads trigger this workflow
            </div>
          </div>
        ) : (
          <div className="space-y-2 max-w-4xl mx-auto">
            {filteredRuns.map(run => (
              <RunRow key={run._id} run={run} onCancel={handleCancel} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
