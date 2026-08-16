import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Eye,
  EyeOff,
  Lock,
  User,
  Building,
  ArrowRight,
  Mail,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";

export default function RegisterScreen() {
  const [formData, setFormData] = useState({
    ownerName: "",
    ownerEmail: "",
    whatsappNumber: "",
    password: "",
    confirmPassword: "",
    name: "",
    businessType: "",
    yearsInBusiness: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { register } = useAuth();
  const router = useRouter();

  const businessTypes = [
    "Retail Shop",
    "Restaurant",
    "Service Business",
    "Manufacturing",
    "Agriculture",
    "Technology",
    "Other",
  ];

  const yearsOptions = [
    "Less than 1 year",
    "1-2 years",
    "3-5 years",
    "6-10 years",
    "More than 10 years",
  ];

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.ownerName.trim()) {
      newErrors.ownerName = "Owner name is required";
    }

    if (!formData.ownerEmail) {
      newErrors.ownerEmail = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.ownerEmail)) {
      newErrors.ownerEmail = "Please enter a valid email address";
    }

    if (!formData.whatsappNumber) {
      newErrors.whatsappNumber = "WhatsApp number is required";
    } else if (
      !/^\d{10,15}$/.test(formData.whatsappNumber.replace(/\D/g, ""))
    ) {
      newErrors.whatsappNumber = "Please enter a valid phone number";
    }

    if (!formData.name.trim()) {
      newErrors.name = "Business name is required";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      await register({
        ownerName: formData.ownerName,
        ownerEmail: formData.ownerEmail,
        whatsappNumber: formData.whatsappNumber,
        password: formData.password,
        name: formData.name,
        businessType: formData.businessType,
        yearsInBusiness: formData.yearsInBusiness,
      });

      Alert.alert(
        "Registration Successful",
        "Your account has been created. Please sign in.",
        [
          {
            text: "OK",
            onPress: () => router.replace("/auth/login"),
          },
        ],
      );
    } catch (error: any) {
      Alert.alert("Registration Failed", error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView className="flex-1 px-6">
          <View className="flex-1 justify-center py-8">
            {/* Header */}
            <View className="items-center mb-6">
              <View className="w-20 h-20 bg-primary-600 rounded-full items-center justify-center mb-4">
                <Text className="text-white text-2xl font-bold">BS</Text>
              </View>
              <Text className="text-3xl font-bold text-gray-900 mb-2">
                Create Account
              </Text>
              <Text className="text-gray-500 text-center">
                Join BizSawa and grow your business
              </Text>
            </View>

            {/* Form */}
            <View className="space-y-4">
              {/* Owner Name */}
              <View>
                <Text className="text-gray-700 font-medium mb-2">
                  Full Name
                </Text>
                <View className="relative mb-3">
                  <User
                    size={20}
                    color="#6b7280"
                    style={{ position: "absolute", left: 12, top: 12 }}
                  />
                  <TextInput
                    className={`border rounded-lg px-12 py-3 text-gray-900 ${
                      errors.ownerName ? "border-red-500" : "border-gray-300"
                    }`}
                    placeholder="Enter your full name"
                    value={formData.ownerName}
                    onChangeText={(text) =>
                      setFormData({ ...formData, ownerName: text })
                    }
                  />
                </View>
                {errors.ownerName && (
                  <Text className="text-red-500 text-sm mt-1">
                    {errors.ownerName}
                  </Text>
                )}
              </View>

              {/* Email */}
              <View className="mb-3">
                <Text className="text-gray-700 font-medium mb-2">Email</Text>
                <View className="relative">
                  <Mail
                    size={20}
                    color="#6b7280"
                    style={{ position: "absolute", left: 12, top: 12 }}
                  />
                  <TextInput
                    className={`border rounded-lg px-12 py-3 text-gray-900 ${
                      errors.ownerEmail ? "border-red-500" : "border-gray-300"
                    }`}
                    placeholder="Enter your email"
                    value={formData.ownerEmail}
                    onChangeText={(text) =>
                      setFormData({ ...formData, ownerEmail: text })
                    }
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                {errors.ownerEmail && (
                  <Text className="text-red-500 text-sm mt-1">
                    {errors.ownerEmail}
                  </Text>
                )}
              </View>

              {/* WhatsApp Number */}
              <View className="mb-3">
                <Text className="text-gray-700 font-medium mb-2">
                  WhatsApp Number
                </Text>
                <TextInput
                  className={`border rounded-lg px-4 py-3 text-gray-900 ${
                    errors.whatsappNumber ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="+254 XXX XXX XXX"
                  value={formData.whatsappNumber}
                  onChangeText={(text) =>
                    setFormData({ ...formData, whatsappNumber: text })
                  }
                  keyboardType="phone-pad"
                />
                {errors.whatsappNumber && (
                  <Text className="text-red-500 text-sm mt-1">
                    {errors.whatsappNumber}
                  </Text>
                )}
              </View>

              {/* Business Name */}
              <View className="mb-3">
                <Text className="text-gray-700 font-medium mb-2">
                  Business Name
                </Text>
                <View className="relative">
                  <Building
                    size={20}
                    color="#6b7280"
                    style={{ position: "absolute", left: 12, top: 12 }}
                  />
                  <TextInput
                    className={`border rounded-lg px-12 py-3 text-gray-900 ${
                      errors.name ? "border-red-500" : "border-gray-300"
                    }`}
                    placeholder="Enter business name"
                    value={formData.name}
                    onChangeText={(text) =>
                      setFormData({ ...formData, name: text })
                    }
                  />
                </View>
                {errors.name && (
                  <Text className="text-red-500 text-sm mt-1">
                    {errors.name}
                  </Text>
                )}
              </View>

              {/* Business Type */}
              <View className="mb-3">
                <Text className="text-gray-700 font-medium mb-2">
                  Business Type
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="flex-row space-x-2"
                >
                  {businessTypes.map((type) => (
                    <TouchableOpacity
                      key={type}
                      onPress={() =>
                        setFormData({ ...formData, businessType: type })
                      }
                      className={`px-4 py-2 rounded-full border ${
                        formData.businessType === type
                          ? "bg-primary-600 border-primary-600"
                          : "bg-white border-gray-300"
                      }`}
                    >
                      <Text
                        className={`text-sm ${
                          formData.businessType === type
                            ? "text-white"
                            : "text-gray-700"
                        }`}
                      >
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Years in Business */}
              <View className="mb-3">
                <Text className="text-gray-700 font-medium mb-2">
                  Years in Business
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="flex-row space-x-2"
                >
                  {yearsOptions.map((years) => (
                    <TouchableOpacity
                      key={years}
                      onPress={() =>
                        setFormData({ ...formData, yearsInBusiness: years })
                      }
                      className={`px-4 py-2 rounded-full border ${
                        formData.yearsInBusiness === years
                          ? "bg-primary-600 border-primary-600"
                          : "bg-white border-gray-300"
                      }`}
                    >
                      <Text
                        className={`text-sm ${
                          formData.yearsInBusiness === years
                            ? "text-white"
                            : "text-gray-700"
                        }`}
                      >
                        {years}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Password */}
              <View className="mb-3">
                <Text className="text-gray-700 font-medium mb-2">Password</Text>
                <View className="relative">
                  <Lock
                    size={20}
                    color="#6b7280"
                    style={{ position: "absolute", left: 12, top: 12 }}
                  />
                  <TextInput
                    className={`border rounded-lg px-12 pr-12 py-3 text-gray-900 ${
                      errors.password ? "border-red-500" : "border-gray-300"
                    }`}
                    placeholder="Create password"
                    value={formData.password}
                    onChangeText={(text) =>
                      setFormData({ ...formData, password: text })
                    }
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={{ position: "absolute", right: 12, top: 12 }}
                  >
                    {showPassword ? (
                      <EyeOff size={20} color="#6b7280" />
                    ) : (
                      <Eye size={20} color="#6b7280" />
                    )}
                  </TouchableOpacity>
                </View>
                {errors.password && (
                  <Text className="text-red-500 text-sm mt-1">
                    {errors.password}
                  </Text>
                )}
              </View>

              {/* Confirm Password */}
              <View className="mb-6">
                <Text className="text-gray-700 font-medium mb-2">
                  Confirm Password
                </Text>
                <View className="relative">
                  <Lock
                    size={20}
                    color="#6b7280"
                    style={{ position: "absolute", left: 12, top: 12 }}
                  />
                  <TextInput
                    className={`border rounded-lg px-12 pr-12 py-3 text-gray-900 ${
                      errors.confirmPassword
                        ? "border-red-500"
                        : "border-gray-300"
                    }`}
                    placeholder="Confirm password"
                    value={formData.confirmPassword}
                    onChangeText={(text) =>
                      setFormData({ ...formData, confirmPassword: text })
                    }
                    secureTextEntry={!showConfirmPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{ position: "absolute", right: 12, top: 12 }}
                  >
                    {showConfirmPassword ? (
                      <EyeOff size={20} color="#6b7280" />
                    ) : (
                      <Eye size={20} color="#6b7280" />
                    )}
                  </TouchableOpacity>
                </View>
                {errors.confirmPassword && (
                  <Text className="text-red-500 text-sm mt-1">
                    {errors.confirmPassword}
                  </Text>
                )}
              </View>

              {/* Register Button */}
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={isLoading}
                className={`bg-primary-600 rounded-lg py-4 items-center ${
                  isLoading ? "opacity-50" : ""
                }`}
              >
                {isLoading ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <View className="flex-row items-center">
                    <Text className="text-white font-semibold text-lg mr-2">
                      Create Account
                    </Text>
                    <ArrowRight size={20} color="white" />
                  </View>
                )}
              </TouchableOpacity>

              {/* Login Link */}
              <View className="flex-row justify-center mt-6">
                <Text className="text-gray-600">Already have an account? </Text>
                <TouchableOpacity onPress={() => router.replace("/auth/login")}>
                  <Text className="text-primary-600 font-semibold">
                    Sign In
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
