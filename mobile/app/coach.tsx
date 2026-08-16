import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import {
  Bot,
  Send,
  User,
  Lightbulb,
  TrendingUp,
  Globe,
  MessageCircle,
  AlertTriangle,
  Mic,
  MicOff,
} from "lucide-react-native";
import { router } from "expo-router";
import { useAuth } from "../contexts/AuthContext";
import { useChat, type ChatMessage } from "../hooks/api/useChat";
import { CoachMessageMarkdown } from "../components/CoachMessageMarkdown";
import Toast from "react-native-toast-message";

interface Message {
  id: string;
  content: string;
  isBot: boolean;
  timestamp: Date;
  language?: "en" | "sw";
}

const initialMessages: Message[] = [
  {
    id: "1",
    content:
      "Habari! I'm your AI business coach. I can help you in English or Kiswahili. How can I assist your business today?",
    isBot: true,
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
    language: "en",
  },
];

const quickActions = [
  {
    id: "1",
    label: "Pricing Help",
    icon: TrendingUp,
    query: "Help me optimize my product pricing",
  },
  {
    id: "2",
    label: "Marketing Tips",
    icon: Lightbulb,
    query: "Give me marketing ideas for my business",
  },
  {
    id: "3",
    label: "Inventory Advice",
    icon: MessageCircle,
    query: "How can I manage my inventory better?",
  },
  {
    id: "4",
    label: "M-Pesa Setup",
    icon: Globe,
    query: "Help me set up M-Pesa for my business",
  },
];

export default function AICoachModal() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [inputMessage, setInputMessage] = useState("");
  const [language, setLanguage] = useState<"en" | "sw">("en");
  const [isListening, setIsListening] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const { userData } = useAuth();
  const { mutateAsync: sendMessage, isPending: isTyping } = useChat();

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-KE", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleSend = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage.trim(),
      isBot: false,
      timestamp: new Date(),
      language,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");

    // Prepare chat history for API
    const chatHistory: ChatMessage[] = messages.map((msg) => ({
      role: msg.isBot ? ("assistant" as const) : ("user" as const),
      content: msg.content,
    }));

    try {
      const response = await sendMessage({
        message: inputMessage.trim(),
        history: chatHistory,
        language,
      });

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: response.response,
        isBot: true,
        timestamp: new Date(),
        language,
      };

      setMessages((prev) => [...prev, botMessage]);

      // Scroll to bottom
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: "Error",
        text2: error.message || "Failed to get response from AI coach",
      });
    }
  };

  const handleQuickAction = (query: string) => {
    setInputMessage(query);
  };

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === "en" ? "sw" : "en"));
    Toast.show({
      type: "success",
      text1: "Language Changed",
      text2:
        language === "en" ? "Switched to Kiswahili" : "Switched to English",
    });
  };

  const handleVoiceInput = () => {
    // TODO: Implement speech recognition
    // For now, show a placeholder message
    Alert.alert(
      "Voice Input",
      "Speech recognition will be available in the next update. Please type your message for now.",
      [{ text: "OK" }],
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View className="flex-1 bg-gray-50">
        <View className="flex-row items-center justify-between p-4 bg-white border-b border-gray-200">
          <View className="flex-row items-center">
            <View className="w-10 h-10 bg-primary-600 rounded-full items-center justify-center mr-3">
              <Bot size={20} color="white" />
            </View>
            <View>
              <Text className="text-lg font-bold text-gray-900">
                AI Business Coach
              </Text>
              <Text className="text-xs text-gray-500">Mshauri wa biashara</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => router.back()}
            className="p-2 bg-gray-100 rounded-full"
          >
            <Text className="font-bold text-gray-500">X</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row justify-center py-2 bg-white border-b border-gray-100 space-x-2">
          <TouchableOpacity
            onPress={toggleLanguage}
            className={`px-4 py-1.5 rounded-full ${language === "en" ? "bg-primary-600" : "bg-gray-100"}`}
          >
            <Text
              className={`font-medium text-xs ${language === "en" ? "text-white" : "text-gray-900"}`}
            >
              English
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={toggleLanguage}
            className={`px-4 py-1.5 rounded-full ${language === "sw" ? "bg-primary-600" : "bg-gray-100"}`}
          >
            <Text
              className={`font-medium text-xs ${language === "sw" ? "text-white" : "text-gray-900"}`}
            >
              Kiswahili
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollViewRef}
          className="flex-1 px-4 pt-4"
          contentContainerStyle={{ paddingBottom: 20 }}
        >
          {/* Quick Actions */}
          <View className="flex-row flex-wrap justify-center mb-6">
            {quickActions.map((action) => (
              <TouchableOpacity
                key={action.id}
                onPress={() => handleQuickAction(action.query)}
                className="bg-white border border-gray-200 rounded-lg py-2 px-3 m-1"
              >
                <Text className="text-xs text-gray-700 font-medium">
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Chat List */}
          {messages.map((msg) => (
            <View
              key={msg.id}
              className={`flex-row mb-4 ${msg.isBot ? "justify-start" : "justify-end"}`}
            >
              {msg.isBot && (
                <View className="w-8 h-8 rounded-full bg-primary-600 items-center justify-center mr-2">
                  <Bot size={16} color="white" />
                </View>
              )}
              <View
                className={`p-3 rounded-2xl max-w-[80%] ${msg.isBot ? "bg-white border border-gray-200 rounded-tl-none" : "bg-primary-600 rounded-tr-none"}`}
              >
                {msg.isBot ? (
                  <CoachMessageMarkdown content={msg.content} />
                ) : (
                  <Text className="text-sm text-white">{msg.content}</Text>
                )}
                <Text
                  className={`text-[10px] mt-1 ${msg.isBot ? "text-gray-400" : "text-primary-200 text-right"}`}
                >
                  {formatTime(msg.timestamp)}
                </Text>
              </View>
              {!msg.isBot && (
                <View className="w-8 h-8 rounded-full bg-gray-500 items-center justify-center ml-2">
                  <User size={16} color="white" />
                </View>
              )}
            </View>
          ))}
          {isTyping && (
            <View className="flex-row justify-start mb-4">
              <View className="w-8 h-8 rounded-full bg-primary-600 items-center justify-center mr-2">
                <Bot size={16} color="white" />
              </View>
              <View className="p-4 bg-white border border-gray-200 rounded-2xl rounded-tl-none">
                <ActivityIndicator size="small" color="#3b82f6" />
              </View>
            </View>
          )}
        </ScrollView>

        <View className="p-3 bg-white border-t border-gray-200 flex-row items-center shadow-lg pb-8">
          <TouchableOpacity
            onPress={handleVoiceInput}
            className="w-10 h-10 bg-gray-100 rounded-full items-center justify-center mr-2"
          >
            {isListening ? (
              <MicOff size={18} color="#ef4444" />
            ) : (
              <Mic size={18} color="#6b7280" />
            )}
          </TouchableOpacity>
          <TextInput
            className="flex-1 bg-gray-100 rounded-full px-4 py-3 mr-2 text-sm text-gray-800"
            placeholder={
              language === "sw"
                ? "Andika ujumbe wako..."
                : "Type your message..."
            }
            value={inputMessage}
            onChangeText={setInputMessage}
            onSubmitEditing={handleSend}
            multiline
          />
          <TouchableOpacity
            onPress={handleSend}
            className="w-12 h-12 bg-primary-600 rounded-full items-center justify-center shadow-md"
          >
            <Send size={18} color="white" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
