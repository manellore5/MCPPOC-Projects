Build a full-stack TypeScript app with a React (Vite) frontend and a Node.js (Fastify)
backend. My goal is to find a financial advisor based on my inputs.  
 Create a form with name, location, budget, investment type, and risk level. Use fixed
dropdowns for location (8 US cities), investment type, and risk level.  
 On submit, call POST /api/match-advisors and display the top 3 matched advisors as cards.  
 Store about 20 mock advisors in a local JSON file (id, name, location, expertise, risk  
 levels, rating, budget range) — a mix of specialists and generalists so every location +  
 investment-type + risk combination returns at least one match.  
 Filter by location, expertise, and risk level, then rank by budget fit (1.0 inside the  
 range, linear decay outside) weighted at 0.6 and normalized rating weighted at 0.4. Return  
 the top 3.
Add a simple MCP server over stdio with two tools: match_advisors(userProfile, advisors?)  
 that falls back to the built-in dataset when advisors is omitted, and show_advisor_form that
returns an MCP-UI iframe resource pointing at the Vite form.
Call the MCP tool inside the API and keep MCP logic fully separate from the REST layer —  
 Fastify spawns the MCP server as a subprocess at startup, and a pure matcher module holds  
 the ranking logic with no framework dependencies.
Validate POST bodies with Fastify's built-in JSON schema (no extra deps). Keep client/ and  
 server/ as sibling folders with a Vite proxy from /api to Fastify in dev, and provide a root
script that runs both with concurrently.
Embed the existing Vite React form inside a Nanobot chat via an MCP-UI iframe. When the form
loads with ?embedded=1, submitting posts the user's profile back to the parent window as a
prompt message so the Nanobot agent picks it up as the next user turn and calls
match_advisors itself.  
 Add a nanobot.yaml that registers an advisor-finder agent (Gemini 2.5 Flash Lite or any other anthropic via the OpenAI-compatible endpoint) pointing at the local MCP server over stdio, and run Nanobot with --exclude-built-in-agents so only this agent is loaded.
