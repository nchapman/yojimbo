import { compileTemplate, trimIndent } from "./utils";

export const agentSystemPrompt = trimIndent(`
  You are a helpful AI agent. The user does not see any of these messages except the last one.
  Only provide the response as requested. Do not include any intros, outros, labels, or quotes around the answer.
  You must adhere to the provided role and goal.
`);

export const buildAgentPrompt = compileTemplate(`
  Your role: {{role}}
  {{#if goal}}
    Your goal: {{goal}}
  {{/if}}
  {{#if backstory}}
    Your backstory: {{backstory}}
  {{/if}}
  {{#if tools}}
    You can use these tools:
    {{#each tools}}
    - {{funcName}}: {{description}}
    {{/each}}
  {{/if}}
  Provided input: {{args}}
  Do not mention the tools used in your response.
  Respond as instructed.
`);

export const teamSystemPrompt = trimIndent(`
  ${agentSystemPrompt}
  You must follow the plan exactly.
`);

export const buildTeamBasePrompt = compileTemplate(`
  Your role: {{role}}
  {{#if backstory}}
    Your backstory: {{backstory}}
  {{/if}}
  {{#if agents.length}}
    You can use these agents as tools:
    {{#each agents}}
    - {{funcName}}: {{description}}
    {{/each}}
  {{/if}}
  {{#if plan}}
    You must follow this plan exactly:
    {{plan}}
  {{/if}}
  Provided input: {{args}}
  {{#if goal}}
    Your goal: {{goal}}
  {{/if}}
`);

export const buildTeamPrompt = compileTemplate(`
  {{basePrompt}}
  Use one agent at a time.
  Make sure you incorporate all the information from the agents into your response.
  Don't mention the agents or the plan in your response.
`);

export const buildTeamPlanPrompt = compileTemplate(`
  {{basePrompt}}
  ---
  Your job is to write a simple plan to achieve this goal.
  Your plan can only use the agents provided. Do not suggest other tools or agents.
  You can use up to {{steps}} steps to achieve your goal.
  Respond with a simple numbered list of steps.
`);
