import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { I18nProvider } from "@/contexts/I18nContext";
import { TicketListingsProvider } from "@/contexts/TicketListingsContext";
import App from "./App.tsx";
import "./index.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <ThemeProvider>
        <I18nProvider>
          <TicketListingsProvider>
            <App />
          </TicketListingsProvider>
        </I18nProvider>
      </ThemeProvider>
    </BrowserRouter>
  </QueryClientProvider>
);
