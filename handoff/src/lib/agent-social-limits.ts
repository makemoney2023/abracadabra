/** Per agent, per client. Counted from social_publish_plans, so no new table. */
export const AGENT_SOCIAL_LIMITS = {
  /** Schedule and publish-now plans prepared in the last hour, denied or blocked ones included. */
  plansPerHour: 20,
  /** Schedule and publish-now plans executed in the last 24 hours. */
  executionsPerDay: 10,
  /** Of those, publish-now. */
  publishNowPerDay: 3,
} as const;
