import React from "react";
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from "react-native";
import { Shield, CreditCard } from "lucide-react-native";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Progress } from "../components/ui/Progress";
import { useAuth } from "../contexts/AuthContext";
import { useBusiness } from "../hooks/api/useBusiness";
import { useCreditTrustPreview } from "../hooks/api/useCreditTrust";

export default function CreditPreviewScreen() {
  const { userData } = useAuth();
  const { data: business } = useBusiness(userData?.id);
  const creditQuery = useCreditTrustPreview("en", true);

  const businessType = business?.businessType?.trim() || "—";

  const formatCurrency = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;

  const getTrustScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const openSaccoResources = () => {
    Linking.openURL("https://www.sasra.go.ke/index.php/publications/licensed-saccos").catch(() => {});
  };

  return (
    <View className="flex-1 bg-gray-50">
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          {creditQuery.isLoading && (
            <View style={{ paddingVertical: 32, alignItems: "center" }}>
              <ActivityIndicator size="small" color="#006b5f" />
              <Text style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>Loading trust preview…</Text>
            </View>
          )}
          {creditQuery.isError && (
            <TouchableOpacity
              onPress={() => creditQuery.refetch()}
              style={{
                marginBottom: 16,
                padding: 16,
                backgroundColor: "#fef2f2",
                borderRadius: 8,
                borderWidth: 1,
                borderColor: "#fecaca",
              }}
            >
              <Text style={{ color: "#991b1b", fontSize: 14 }}>
                Could not load credit preview. Tap to retry.
              </Text>
            </TouchableOpacity>
          )}
          {creditQuery.data && (
            <>
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle>
                    <View className="flex-row items-center">
                      <View className="mr-2">
                        <Shield size={16} color="#374151" />
                      </View>
                      <Text className="font-bold">Trust score</Text>
                    </View>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Text className="text-xs text-gray-500 mb-2">{creditQuery.data.disclaimer}</Text>
                  <Text className="text-sm font-semibold text-gray-900 mb-1">{creditQuery.data.strings.headline}</Text>
                  <Text className="text-xs text-gray-600 mb-4">{creditQuery.data.strings.summary}</Text>
                  <View className="items-center mb-4">
                    <Text
                      className={`text-4xl font-bold ${getTrustScoreColor(creditQuery.data.trustScore)}`}
                    >
                      {creditQuery.data.trustScore}
                    </Text>
                    <Text className="text-gray-500 text-sm">{creditQuery.data.ratingLabel}</Text>
                  </View>
                  {creditQuery.data.components.map((c) => (
                    <View key={c.id} className="mb-3">
                      <View className="flex-row justify-between mb-1">
                        <Text className="text-xs text-gray-600 flex-1 pr-2">{c.label}</Text>
                        <Text className="text-xs font-bold">{c.score}</Text>
                      </View>
                      <Progress value={c.score} className="my-1" />
                      <Text className="text-[10px] text-gray-400">{c.detail}</Text>
                    </View>
                  ))}
                </CardContent>
              </Card>

              <Card className="mb-4">
                <CardHeader>
                  <CardTitle>
                    <Text className="font-bold">How weights work</Text>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {creditQuery.data.weightsExplained.map((w) => (
                    <View key={w.id} className="mb-3 pb-3 border-b border-gray-100 last:border-0">
                      <Text className="text-xs font-semibold text-gray-800">{w.label}</Text>
                      <Text className="text-[11px] text-gray-600 mt-1">{w.description}</Text>
                    </View>
                  ))}
                </CardContent>
              </Card>

              <Card className="mb-4">
                <CardHeader>
                  <CardTitle>
                    <Text className="font-bold">Suggested next steps</Text>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {creditQuery.data.actionableInsights.map((a, i) => (
                    <View key={i} className="mb-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                      <Text className="text-xs font-bold text-blue-900">{a.title}</Text>
                      <Text className="text-[11px] text-blue-800 mt-1">{a.detail}</Text>
                    </View>
                  ))}
                </CardContent>
              </Card>

              <Card className="bg-green-50 border-green-200 mb-4">
                <CardHeader>
                  <CardTitle>
                    <View className="flex-row items-center">
                      <View className="mr-2">
                        <CreditCard size={16} color="#16a34a" />
                      </View>
                      <Text className="font-bold text-green-800">Illustrative loan ceiling</Text>
                    </View>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Text className="text-xs text-gray-600 mb-3">
                    Not a lender offer — based on recent on-platform sales only.
                  </Text>
                  <View className="flex-row justify-between text-center mb-4">
                    <View className="items-center flex-1">
                      <Text className="text-2xl font-bold text-green-600">
                        {formatCurrency(creditQuery.data.illustrativeLoanCeiling)}
                      </Text>
                      <Text className="text-xs text-gray-600">Ceiling</Text>
                    </View>
                    <View className="items-center flex-1">
                      <Text className="text-lg font-bold text-green-700">
                        {formatCurrency(creditQuery.data.signals.totalSales90d)}
                      </Text>
                      <Text className="text-xs text-gray-600">Sales (90d)</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    className="bg-green-600 py-3 rounded-lg items-center mb-2"
                    onPress={openSaccoResources}
                    activeOpacity={0.85}
                  >
                    <Text className="text-white font-bold">Licensed SACCOs (SASRA)</Text>
                  </TouchableOpacity>
                </CardContent>
              </Card>

              <Card className="mb-4">
                <CardHeader>
                  <CardTitle>
                    <Text className="font-bold">Loan providers</Text>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Text className="text-xs text-gray-500 mb-3">
                    Filtered for your business type ({businessType}). Verify rates with each institution.
                  </Text>
                  {(creditQuery.data.loanProviders || [])
                    .filter(
                      (loan) =>
                        loan.suitedFor.includes(businessType) || loan.suitedFor.includes("Other"),
                    )
                    .map((loan) => (
                      <View
                        key={loan.id}
                        className="mb-3 p-3 border border-gray-200 rounded-lg bg-white"
                      >
                        <Text className="text-sm font-bold text-gray-900">{loan.institution}</Text>
                        <Text className="text-xs text-gray-600">{loan.product}</Text>
                        <Text className="text-[10px] text-gray-500 mt-1">
                          Up to {formatCurrency(loan.maxAmount)} · {loan.interestRate}
                        </Text>
                        {loan.applyUrl && loan.applyUrl !== "#" ? (
                          <TouchableOpacity
                            className="mt-2 self-start"
                            onPress={() => Linking.openURL(loan.applyUrl).catch(() => {})}
                          >
                            <Text className="text-xs font-bold text-primary-700">Open link</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ))}
                </CardContent>
              </Card>
            </>
          )}
        </ScrollView>
      </View>
  );
}
