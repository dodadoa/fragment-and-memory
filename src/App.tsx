import GranularApp from "./GranularApp";
import { ThemeProvider } from "./theme/ThemeProvider";

export default function App() {
  return (
    <ThemeProvider>
      <GranularApp />
    </ThemeProvider>
  );
}
