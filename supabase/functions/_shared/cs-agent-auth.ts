export function validateCsAgentKey(req: Request): boolean {
  const provided = req.headers.get("x-cs-agent-key");
  const expected = Deno.env.get("CS_AGENT_KEY");
  console.log(`[CS-AUTH] Header len: ${provided?.length}, Secret len: ${expected?.length}, match: ${provided?.trim() === expected?.trim()}`);
  if (!provided || !expected) return false;
  return provided.trim() === expected.trim();
}
