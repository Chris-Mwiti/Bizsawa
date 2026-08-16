import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Trophy,
  Plus,
  Trash2,
  CheckCircle,
  ChevronLeft,
  Award,
} from "lucide-react-native";
import { Card, CardContent } from "../components/ui/Card";
import { useAchievements, Achievement } from "../hooks/api/useAchievements";
import { TAB_BAR_SCROLL_PADDING } from "../constants/tabBar";

export default function RewardsScreen() {
  const router = useRouter();
  const {
    achievements,
    isLoading,
    addAchievement,
    toggleAchievement,
    deleteAchievement,
  } = useAchievements();

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async () => {
    if (!newTitle.trim()) {
      Alert.alert("Error", "Achievement title is required");
      return;
    }
    try {
      await addAchievement(newTitle, newDesc);
      setNewTitle("");
      setNewDesc("");
      setIsAdding(false);
    } catch (err) {
      Alert.alert("Error", "Could not add achievement");
    }
  };

  const confirmDelete = (id: number) => {
    Alert.alert(
      "Delete Achievement",
      "Are you sure you want to remove this achievement?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteAchievement(id),
        },
      ]
    );
  };

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="px-4 pt-12 pb-4 bg-white border-b border-gray-200 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <ChevronLeft size={24} color="#374151" />
        </TouchableOpacity>
        <View>
          <Text className="text-xl font-bold text-gray-900">Business Rewards</Text>
          <Text className="text-xs text-gray-500">Tuzo za Biashara / Achievements</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_SCROLL_PADDING }}
      >
        {/* Stats Card */}
        <Card className="mb-6 bg-primary-700 border-0">
          <CardContent className="p-6 flex-row items-center">
            <View className="bg-white/20 p-3 rounded-full mr-4">
              <Trophy size={32} color="white" />
            </View>
            <View>
              <Text className="text-white text-lg font-bold">
                {achievements.filter((a) => a.earned).length} of {achievements.length}
              </Text>
              <Text className="text-primary-100 text-xs">Achievements Unlocked</Text>
            </View>
          </CardContent>
        </Card>

        {/* Add Section */}
        {!isAdding ? (
          <TouchableOpacity
            onPress={() => setIsAdding(true)}
            className="flex-row items-center justify-center p-4 border-2 border-dashed border-primary-300 rounded-xl mb-6"
          >
            <Plus size={20} color="#006b5f" />
            <Text className="ml-2 text-primary-700 font-bold">Add New Achievement</Text>
          </TouchableOpacity>
        ) : (
          <Card className="mb-6 border-primary-200">
            <CardContent className="p-4">
              <Text className="font-bold mb-2">New Achievement</Text>
              <TextInput
                className="bg-gray-100 p-3 rounded-lg mb-3"
                placeholder="Title (e.g., Sold 100 items)"
                value={newTitle}
                onChangeText={setNewTitle}
              />
              <TextInput
                className="bg-gray-100 p-3 rounded-lg mb-4"
                placeholder="Description (Optional)"
                value={newDesc}
                onChangeText={setNewDesc}
                multiline
              />
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setIsAdding(false)}
                  className="flex-1 p-3 bg-gray-200 rounded-lg items-center"
                >
                  <Text className="font-bold text-gray-700">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleAdd}
                  className="flex-1 p-3 bg-primary-600 rounded-lg items-center"
                >
                  <Text className="font-bold text-white">Save</Text>
                </TouchableOpacity>
              </View>
            </CardContent>
          </Card>
        )}

        {/* List */}
        {isLoading ? (
          <ActivityIndicator size="large" color="#006b5f" className="mt-8" />
        ) : (
          <View>
            {achievements.length === 0 ? (
              <View className="items-center py-12">
                <Award size={48} color="#d1d5db" />
                <Text className="text-gray-400 mt-4 text-center">
                  No achievements yet.{"\n"}Set your first business goal!
                </Text>
              </View>
            ) : (
              achievements.map((item) => (
                <Card
                  key={item.id}
                  className={`mb-3 border-l-4 ${item.earned ? "border-l-green-500" : "border-l-gray-300"}`}
                >
                  <CardContent className="p-4 flex-row items-center">
                    <TouchableOpacity
                      onPress={() => toggleAchievement(item.id, !item.earned)}
                      className={`w-10 h-10 rounded-full items-center justify-center mr-4 ${item.earned ? "bg-green-100" : "bg-gray-100"}`}
                    >
                      {item.earned ? (
                        <CheckCircle size={20} color="#16a34a" />
                      ) : (
                        <Award size={20} color="#9ca3af" />
                      )}
                    </TouchableOpacity>
                    
                    <View className="flex-1">
                      <Text className={`font-bold ${item.earned ? "text-gray-900" : "text-gray-500"}`}>
                        {item.title}
                      </Text>
                      {item.description && (
                        <Text className="text-xs text-gray-400 mt-0.5">{item.description}</Text>
                      )}
                      {item.earned && item.earnedAt && (
                        <Text className="text-[10px] text-green-600 mt-1">
                          Earned on {new Date(item.earnedAt).toLocaleDateString()}
                        </Text>
                      )}
                    </View>

                    <TouchableOpacity onPress={() => confirmDelete(item.id)} className="p-2">
                      <Trash2 size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </CardContent>
                </Card>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
