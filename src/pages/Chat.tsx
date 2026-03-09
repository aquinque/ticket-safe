import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
});

interface Message {
  role: "user" | "assistant";
  content: string;
}

const Chat = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Salut ! Je suis Claude, votre assistant IA pour le développement. Posez-moi des questions sur le code, demandez de l'aide pour déboguer, ou générez du code. Comment puis-je vous aider ?"
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const systemPrompt = "Vous êtes un assistant de codage expert. Fournissez des réponses claires, concises et précises sur le code, les technologies web, React, TypeScript, et les meilleures pratiques. Utilisez des exemples de code quand approprié.";
      const conversationMessages = messages.concat(userMessage).map(msg => ({
        role: msg.role as "user" | "assistant",
        content: msg.content
      }));
      const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        system: systemPrompt,
        messages: conversationMessages,
      });
      const assistantMessage: Message = {
        role: "assistant",
        content: response.content[0]?.type === "text" ? response.content[0].text : "Désolé, je n'ai pas pu générer une réponse.",
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Erreur:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Erreur : Impossible de se connecter à Claude." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Claude Code</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96 mb-4">
            {messages.map((msg, index) => (
              <div key={index} className={`mb-2 ${msg.role === "user" ? "text-right" : "text-left"}`}>
                <span className={`inline-block p-2 rounded ${msg.role === "user" ? "bg-blue-500 text-white" : "bg-gray-200"}`}>
                  {msg.content}
                </span>
              </div>
            ))}
            {loading && <div className="text-center">Thinking...</div>}
          </ScrollArea>
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              onKeyPress={(e) => e.key === "Enter" && sendMessage()}
            />
            <Button onClick={sendMessage} disabled={loading}>
              Send
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Chat;