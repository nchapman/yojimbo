import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { Agent, LLMCompletion } from "../agents/agent";
import { DefaultToolInput, Tool, JSONSchema } from "../tools/tool";

export interface TeamConfig {
  role?: string;
  goal?: string | null;
  backstory?: string;
  plan?: string;
  parameters?: JSONSchema<DefaultToolInput>;
  llm: LLMCompletion;
  agents: Agent[];
  tools?: Tool[] | null;
  maxIter?: number | null;
  verbose?: boolean | null;
}

export class Team extends Agent {
  private agents: Agent[];
  private plan: string | null;

  constructor(config: TeamConfig) {
    super({
      ...config,
      role: config.role ?? "Agent Manager",
      goal: config.goal ?? "Use the provided agents to respond to the input",
    });
    this.agents = config.agents;
    this.plan = config.plan ?? null;

    // Pass tools down to agents
    this.propagateToAgents();
  }

  protected propagateToAgents() {
    this.agents.forEach((agent) => {
      // Set tools to the union of the team's tools and the agent's tools
      agent.tools = Array.from(new Set([...this.tools, ...agent.tools]));

      // Set llm if it's not set
      if (!agent.llm) {
        agent.llm = this.llm;
      }
    });
  }

  public async execute(args: DefaultToolInput) {
    // Get or generate the plan first
    await this.ensurePlan(args);

    console.log("📋 Plan:", this.plan);

    // Call the parent execute method with the enhanced args
    return super.execute(args);
  }

  // Tools in this context are agents
  public getToolSchemas() {
    return this.agents.map((agent) => agent.toSchema());
  }

  protected async ensurePlan(args: DefaultToolInput): Promise<void> {
    if (!this.plan) {
      const lines = this.getBasePromptLines(args);
      const steps = this.agents.length + 1;

      lines.push(`---`);
      lines.push(`Your job is to write a simple plan to achieve this goal.`);
      lines.push(
        `Your plan can only use the agents provided. Do not suggest other tools or agents.`
      );
      lines.push(`You can use up to ${steps} steps to achieve your goal.`);
      lines.push(`Respond with a simple numbered list of steps.`);

      const planPrompt = lines.join("\n");

      console.log("📋 Generating plan:", planPrompt);

      const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: this.systemPrompt },
        { role: "user", content: planPrompt },
      ];

      const response = await this.llm({ messages });
      this.plan = response.choices[0]?.message?.content ?? "No plan generated.";
    }
  }

  protected findTool(funcName: string) {
    return this.agents.find((agent) => agent.funcName === funcName);
  }

  protected getPrompt(args: DefaultToolInput): string {
    const lines = this.getBasePromptLines(args);

    lines.push(`Use the provided agents to respond with a helpful answer.`);

    return lines.join("\n");
  }

  protected getBasePromptLines(args: DefaultToolInput): string[] {
    const lines = [];

    lines.push(`Your role: ${this.role}`);

    if (this.goal) {
      lines.push(`Your goal: ${this.goal}`);
    }

    if (this.backstory) {
      lines.push(`Your backstory: ${this.backstory}`);
    }

    // if (this.agents.length > 0) {
    //   lines.push(`You can use these agents:`);
    //   this.agents.forEach((agent) => {
    //     lines.push(`- ${agent.name}: ${agent.description}`);
    //   });
    // }

    if (this.plan) {
      lines.push(`Follow this plan:`);
      lines.push(this.plan);
    }

    lines.push(`Provided input: ${JSON.stringify(args)}`);

    return lines;
  }
}
