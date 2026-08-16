import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Share,
} from "react-native";
import { ArrowLeft, Sparkles, AlertCircle, Share as ShareIcon } from "lucide-react-native";
import { router } from "expo-router";
// import { useAuth } from "../contexts/AuthContext";
// import { api } from "../lib/api";
// import Toast from "react-native-toast-message";

// Platform aware proxy URL avoiding emulator localhost crashing
const PROXY_URL: string =
  process.env.EXPO_PUBLIC_PROXY_URL ||
  (Platform.OS === "android"
    ? "http://10.0.2.2:3001"
    : "http://localhost:3001");

const generateTextViaProxy = async (
  platform: string,
  contentType: string,
  tone: string,
  description: string,
  goalLabel: string,
): Promise<string> => {
  const charLimits: Record<string, number> = {
    twitter: 280,
    instagram: 2200,
    linkedin: 3000,
  };
  const limit = charLimits[platform] || 1000;

  const prompt =
    `Write a ${tone} social media ${contentType} for ${platform} about: "${description}". ` +
    `Goal: ${goalLabel}. African small business context. ` +
    `Include relevant emojis. Keep it under ${limit} characters. Return ONLY the post text, nothing else.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 18000);

  try {
    const res = await fetch(
      `${PROXY_URL}/api/generate-text?prompt=${encodeURIComponent(prompt)}`,
      { signal: controller.signal },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `Proxy error ${res.status}`);
    }

    const data = await res.json();
    if (!data.text) throw new Error("Empty response from proxy");
    return data.text;
  } finally {
    clearTimeout(timeoutId);
  }
};

const generatePollinationsImage = (prompt: string): string => {
  const imagePrompt = `${prompt}, African small business, vibrant colors, professional marketing style, high quality`;
  return `${PROXY_URL}/api/generate-image?prompt=${encodeURIComponent(imagePrompt)}&width=512&height=512&seed=${Date.now()}`;
};

const platforms = [
  { id: "instagram", label: "Instagram", color: "bg-pink-500" },
  { id: "twitter", label: "Twitter", color: "bg-blue-500" },
  { id: "linkedin", label: "LinkedIn", color: "bg-blue-700" },
];

export default function SocialMediaModal() {
  const [selectedGoal, setSelectedGoal] = useState<any>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string>("instagram");
  const [tone, setTone] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [generatedContent, setGeneratedContent] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const goals = [
    {
      id: "grow",
      label: "Grow My Business",
      sublabel: "Expand reach & revenue",
      color: "border-emerald-500",
    },
    {
      id: "attract",
      label: "Attract Customers",
      sublabel: "Bring in fresh leads",
      color: "border-primary-500",
    },
    {
      id: "launch",
      label: "Launch a Product",
      sublabel: "Announce something new",
      color: "border-orange-500",
    },
    {
      id: "trust",
      label: "Build Trust & Authority",
      sublabel: "Position yourself as the best",
      color: "border-amber-500",
    },
    {
      id: "sale",
      label: "Run a Promotion",
      sublabel: "Drive urgency",
      color: "border-rose-500",
    },
    {
      id: "retain",
      label: "Keep Customers Coming",
      sublabel: "Loyalty & repeat business",
      color: "border-yellow-500",
    },
  ];

  const tones = [
    { id: "professional", label: "Professional" },
    { id: "casual", label: "Casual" },
    { id: "promotional", label: "Promotional" },
    { id: "inspirational", label: "Inspirational" },
    { id: "humorous", label: "Humorous" },
    { id: "informative", label: "Informative" },
  ];

  const getTemplateContent = (
    plt: string,
    type: string,
    tn: string,
    desc: string,
  ): string => {
    const templates: Record<string, Record<string, Record<string, string>>> = {
      instagram: {
        post: {
          professional: `📊 Elevate your business with ${desc}.\n\nAfrican entrepreneurs deserve world-class tools.\n\n✅ Reduce costs\n✅ Grow faster\n✅ Stay ahead\n\nLink in bio.`,
          casual: `Hey business owners! 👋\n\n${desc} is changing how we run businesses here in Africa!\n\nTry it and thank us later 😄 Link in bio!`,
          promotional: `🔥 BIG NEWS: ${desc} is here!\n\n⚡ Limited spots\n🎁 Free onboarding\n\n👆 Link in bio — don't sleep on this!`,
          inspirational: `🌟 Your business breakthrough starts with ${desc}.\n\nChoose wisely. Choose growth. 💪\n\nLink in bio.`,
          humorous: `Plot twist: ${desc} makes running a business less painful 😂\n\nWho knew?! 🙃 Link in bio.`,
          informative: `💡 ${desc} can boost efficiency by up to 50%.\n\nAfrican businesses are already winning.\n\nLink in bio. 📚`,
        },
        ad: {
          promotional: `⚡ SPECIAL OFFER: ${desc}\n\nFirst 100 get FREE access. Claim yours — link in bio!`,
          professional: `📊 ${desc} — The professional choice.\n\nOptimize. Scale. Succeed. Get started — link in bio.`,
        },
      },
      linkedin: {
        post: {
          professional: `The Future of African Business: ${desc}\n\nBusinesses investing in the right tools today will lead tomorrow.\n\n• Reduced costs\n• Real-time insights\n• Mobile-first\n\nWhat tools are you using?\n\n#DigitalTransformation #AfricanBusiness`,
          inspirational: `African entrepreneurs are building the future. 🌍\n\n${desc} is one piece of that puzzle. Keep going.\n\n#AfricanEntrepreneur`,
          informative: `Data: Businesses using ${desc} see 40% faster growth.\n\nGood tools remove friction = more time for what matters.\n\n#DataDriven #BusinessIntelligence`,
        },
      },
    };
    return (
      templates[plt]?.[type]?.[tn] ||
      templates[plt]?.["post"]?.[tn] ||
      `${desc}\n\nBuilt for African small businesses. Built for growth.\n\n#SmallBusiness #Africa`
    );
  };

  const generateSmartHashtags = (
    plt: string,
    tn: string,
    desc: string,
    content: string,
  ): string[] => {
    const base = ["#SmallBusiness", "#AfricanTech", "#Entrepreneurs"];
    const toneMap: Record<string, string[]> = {
      professional: ["#DigitalTransformation", "#BusinessInnovation"],
      casual: ["#EntrepreneurLife"],
      promotional: ["#LimitedOffer"],
      inspirational: ["#Motivation"],
      humorous: ["#StartupLife"],
      informative: ["#BusinessEducation"],
    };

    const contextMap: Record<string, string[]> = {
      inventory: ["#InventoryManagement"],
      sales: ["#SalesTracker"],
      payment: ["#MobileMoney", "#MPesa"],
      ai: ["#Automation"],
    };

    let contextTags: string[] = [];
    Object.entries(contextMap).forEach(([key, tags]) => {
      if (
        desc.toLowerCase().includes(key) ||
        content.toLowerCase().includes(key)
      )
        contextTags.push(...tags);
    });

    return [...base, ...(toneMap[tn] || []), ...contextTags]
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 5);
  };

  const generateContent = async () => {
    if (!selectedGoal || !tone || !description.trim()) return;

    const platform = selectedPlatform;
    const contentType = selectedGoal.id === "sale" ? "ad" : "post";

    setIsGenerating(true);
    setErrorMsg("");
    setGeneratedContent(null);

    const imageUrl = generatePollinationsImage(description);
    let textContent = "";
    let source = "template";

    try {
      textContent = await generateTextViaProxy(
        platform,
        contentType,
        tone,
        description,
        selectedGoal.label,
      );
      source = "ai";
    } catch (err: any) {
      console.warn("[Generate] Text failed, using template:", err?.message);
      setErrorMsg(
        `AI failure (${err?.message}) - Generated via local template instead.`,
      );
      textContent = getTemplateContent(
        platform,
        contentType,
        tone,
        description,
      );
      source = "template";
    }

    const hashtags = generateSmartHashtags(
      platform,
      tone,
      description,
      textContent,
    );
    setGeneratedContent({
      platform,
      type: contentType,
      content: textContent,
      hashtags,
      imageUrl,
      source,
    });
    setIsGenerating(false);
  };

  const handleShare = async () => {
    if (!generatedContent) return;
    const shareText = `${generatedContent.content}\n\n${generatedContent.hashtags.join(" ")}`;
    try {
      await Share.share({
        message: shareText,
      });
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View className="flex-1 bg-white">
        <View className="flex-row items-center p-4 border-b border-gray-100 mt-2">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-2">
            <ArrowLeft size={20} color="#374151" />
          </TouchableOpacity>
          <View>
            <Text className="text-lg font-bold">Create Content</Text>
            <Text className="text-xs text-gray-500">
              Pick a goal and we'll handle the rest
            </Text>
          </View>
        </View>

        <ScrollView
          className="flex-1 px-4 py-4"
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {errorMsg ? (
            <View className="bg-amber-50 p-3 rounded-lg flex-row items-center mb-4 border border-amber-200">
              <View className="mr-2">
                <AlertCircle size={16} color="#d97706" />
              </View>
              <Text className="text-sm text-amber-700 font-medium flex-1">
                {errorMsg}
              </Text>
            </View>
          ) : null}

          <Text className="text-xs font-bold uppercase text-gray-500 mb-2">
            Choose Platform
          </Text>
          <View className="flex-row justify-between mb-6">
            {platforms.map((platform) => (
              <TouchableOpacity
                key={platform.id}
                onPress={() => setSelectedPlatform(platform.id)}
                className={`flex-1 mx-1 py-3 rounded-lg items-center ${selectedPlatform === platform.id ? platform.color : "bg-gray-100"}`}
              >
                <Text
                  className={`font-bold text-xs ${selectedPlatform === platform.id ? "text-white" : "text-gray-600"}`}
                >
                  {platform.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text className="text-xs font-bold uppercase text-gray-500 mb-2">
            What's your goal?
          </Text>
          <View className="flex-row flex-wrap justify-between mb-6">
            {goals.map((g) => (
              <TouchableOpacity
                key={g.id}
                onPress={() =>
                  setSelectedGoal(selectedGoal?.id === g.id ? null : g)
                }
                className={`w-[48%] mb-2 p-3 rounded-xl border-2 ${selectedGoal?.id === g.id ? g.color + " bg-gray-50" : "border-gray-100 bg-white"}`}
              >
                <Text className="font-bold text-sm text-gray-800">
                  {g.label}
                </Text>
                <Text className="text-[10px] text-gray-500 mt-1">
                  {g.sublabel}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text className="text-xs font-bold uppercase text-gray-500 mb-2">
            Tone
          </Text>
          <View className="flex-row flex-wrap justify-between mb-6">
            {tones.map((t) => (
              <TouchableOpacity
                key={t.id}
                onPress={() => setTone(tone === t.id ? "" : t.id)}
                className={`w-[31%] mb-2 py-3 rounded-lg border items-center ${tone === t.id ? "bg-[#00C4B4] border-[#00C4B4]" : "bg-white border-gray-200"}`}
              >
                <Text
                  className={`font-bold text-xs ${tone === t.id ? "text-white" : "text-gray-600"}`}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text className="text-xs font-bold uppercase text-gray-500 mb-2">
            What are you promoting?
          </Text>
          <TextInput
            multiline
            numberOfLines={4}
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. My new M-Pesa payment feature..."
            className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-800 h-32 mb-6"
            textAlignVertical="top"
          />

          <TouchableOpacity
            onPress={generateContent}
            disabled={
              !selectedGoal || !tone || !description.trim() || isGenerating
            }
            className={`py-4 rounded-xl items-center flex-row justify-center mb-6 shadow-sm ${!selectedGoal || !tone || !description.trim() || isGenerating ? "bg-gray-300" : "bg-[#00C4B4]"}`}
          >
            {isGenerating ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <View className="mr-2">
                <Sparkles size={20} color="white" />
              </View>
            )}
            <Text className="text-white font-bold text-lg">
              {isGenerating ? "Generating..." : "Generate Content"}
            </Text>
          </TouchableOpacity>

          {generatedContent && (
            <View className="mt-2">
              <View className="flex-row justify-between mb-2 items-center">
                <Text className="font-bold">Preview</Text>
                <Text className="text-[10px] text-gray-400 uppercase tracking-widest">
                  {generatedContent.platform} {generatedContent.type}
                </Text>
              </View>
              <View className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <View className="flex-row items-center p-3 border-b border-gray-100 justify-between">
                  <View className="flex-row items-center">
                    <View className="w-8 h-8 rounded-full bg-blue-600 mr-3 items-center justify-center">
                      <Text className="text-white text-xs font-bold">NM</Text>
                    </View>
                    <Text className="font-medium text-sm">
                      bizsawa_official
                    </Text>
                  </View>
                  <Text className="text-[10px] text-gray-400 bg-gray-100 px-2 py-1 rounded-sm">
                    {generatedContent.source}
                  </Text>
                </View>
                {generatedContent.imageUrl && (
                  <Image
                    source={{ uri: generatedContent.imageUrl }}
                    className="w-full h-64 bg-gray-100"
                    resizeMode="cover"
                  />
                )}
                <View className="p-4">
                  <Text className="text-sm text-gray-800 mb-2 leading-tight">
                    {generatedContent.content}
                  </Text>
                  <Text className="text-blue-600 text-xs font-medium">
                    {generatedContent.hashtags.join(" ")}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={handleShare}
                className="mt-4 bg-gray-900 py-4 rounded-xl items-center flex-row justify-center shadow-md"
              >
                <View className="mr-2">
                  <ShareIcon size={18} color="white" />
                </View>
                <Text className="text-white font-bold text-lg">Share Now</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
