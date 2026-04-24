import { AdvisorForm } from "./components/AdvisorForm.js";
import { isEmbedded } from "./postMessageBridge.js";

export function App() {
  return <AdvisorForm embedded={isEmbedded()} />;
}
