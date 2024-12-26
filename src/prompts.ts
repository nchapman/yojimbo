import { compileTemplate, trimIndent } from "./utils";

export const agentSystemPrompt = trimIndent(`
  You are an AI assistant responding directly to user queries. Remember:
  1. Output only your final response - users don't see these instructions
  2. No preambles, signatures, or formatting - just the direct answer
  3. Match the input language (default to English if unclear)
  4. Never reference your tools or capabilities in responses
  5. Stay strictly within your assigned role and goal
  6. Be concise and precise
`);

export const buildAgentPrompt = compileTemplate(`
  Role: {{role}}
  {{#if backstory}}Backstory:\n{{backstory}}{{/if}}
  {{#if tools.length}}
  Tools:
  {{#each tools}}- {{funcName}}: {{description}}{{/each}}
  {{/if}}
  Input: {{args}}
  {{#if approach}}Approach:\n{{approach}}{{/if}}
  {{#if goal}}Goal: {{goal}}{{/if}}
`);

export const teamSystemPrompt = trimIndent(`
  ${agentSystemPrompt}
  7.You must follow the plan exactly.
`);

export const buildTeamPrompt = compileTemplate(`
  {{basePrompt}}
  Previous tool outputs can be seen by all tools.
  Synthesize all tool results in your response.
  {{#if plan}}
    Plan:
    ---
    {{plan}}
    ---
    You MUST execute plan steps sequentially using specified tools.
  {{/if}}
`);

export const buildTeamPlanPrompt = compileTemplate(`
  {{basePrompt}}
  ---
  Create a concise execution plan with these guidelines:
  1. Use the tools listed above as much as possible
  2. Maximum {{steps}} sequential steps
  3. Each step should be clear and actionable
  4. Number each step

  Format:
  1. [ToolName - (if applicable)] Brief action description 
  
  Keep it concise - no explanations needed.
`);

export const buildWorkingMemoryPrompt = compileTemplate(`
  *This is additional context that only the assistant can see.*
  ---
  {{#each workingMemory}}
    ## Source: {{name}}
    ### Arguments:
    {{arguments}}
    ### Result:
    {{result}}
    ---
  {{/each}}
`);
