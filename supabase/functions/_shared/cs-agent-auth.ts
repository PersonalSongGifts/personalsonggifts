export function validateCsAgentKey(req: Request): boolean {
  const provided = req.headers.get("x-cs-agent-key");
  const expected = Deno.env.get("CS_AGENT_KEY");
  if (!provided || !expected) return false;
  return provided.trim() === expected.trim();
}
