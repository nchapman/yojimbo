import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { Agent, AgentConfig } from "../agents/agent";
import { DefaultToolInput } from "../tools/tool";

export interface TeamConfig<TArgs = DefaultToolInput>
  extends Omit<AgentConfig<TArgs>, "role" | "goal"> {
  role?: string;
  goal?: string;
  plan?: string;
  agents: Agent[];
}

export class Team<TArgs = DefaultToolInput, TReturn = string> extends Agent<
  TArgs,
  TReturn
> {
  private agents: Agent[];
  private plan: string | null;

  constructor(config: TeamConfig<TArgs>) {
    super({
      ...config,
      role: config.role ?? "Agent Manager",
      goal: config.goal ?? "Use the provided agents to respond to the input",
    });

    this.agents = config.agents;
    this.plan = config.plan ?? null;

    // Pass tools down to agents
    this.propagateToAgents();
    this.systemPrompt += "\nYou must follow the plan exactly.";
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

  public async execute(args: TArgs): Promise<TReturn> {
    this.ensureLLM();

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

  protected async ensurePlan(args: TArgs): Promise<void> {
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

      const response = await this.llm!({ messages });
      this.plan = response.choices[0]?.message?.content ?? "No plan generated.";
    }
  }

  protected findTool(funcName: string) {
    return this.agents.find((agent) => agent.funcName === funcName);
  }

  protected getPrompt(args: TArgs): string {
    const lines = this.getBasePromptLines(args);

    lines.push(
      this.trimBlock(`
      Use one agent at a time.
      Make sure you incorporate all the information from the agents into your response.
      Don't mention the agents or the plan in your response.
    `)
    );

    return lines.join("\n");
  }

  protected getBasePromptLines(args: TArgs): string[] {
    const lines = [];

    lines.push(`Your role: ${this.role}`);

    if (this.backstory) {
      lines.push(`Your backstory: ${this.backstory}`);
    }

    if (this.agents.length > 0) {
      lines.push(`You can use these agents as tools:`);
      this.agents.forEach((agent) => {
        lines.push(`- ${agent.funcName}: ${agent.description}`);
      });
    }

    if (this.plan) {
      lines.push(`You must follow this plan exactly:`);
      lines.push(this.plan);
    }

    lines.push(`Provided input: ${JSON.stringify(args)}`);

    if (this.goal) {
      lines.push(`Your goal: ${this.goal}`);
    }

    return lines;
  }
}
