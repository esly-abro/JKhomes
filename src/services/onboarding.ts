/**
 * Onboarding API Service
 * Frontend service for onboarding wizard state persistence.
 */

import api from './api';

export interface OnboardingState {
  completed: boolean;
  currentStep: string;
  stepsCompleted: string[];
  data: Record<string, any>;
  startedAt: string | null;
  completedAt: string | null;
}

/**
 * Get onboarding state
 */
export async function getOnboardingState(): Promise<OnboardingState> {
  const { data } = await api.get('/api/onboarding');
  return data.data;
}

/**
 * Save step data
 */
export async function saveOnboardingStep(step: string, stepData: Record<string, any>): Promise<OnboardingState> {
  const { data } = await api.post(`/api/onboarding/steps/${step}`, stepData);
  return data.data;
}

/**
 * Complete onboarding
 */
export async function completeOnboarding(): Promise<OnboardingState> {
  const { data } = await api.post('/api/onboarding/complete');
  return data.data;
}
