import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, HelpCircle, LineChart, Package, BrainCircuit } from 'lucide-react-native';
import LottieView from 'lottie-react-native';

const { width } = Dimensions.get('window');

const ONBOARDING_DATA = [
  {
    id: '1',
    badge: 'The Problem',
    title: 'Running Business Blind?',
    description: 'Bookkeeping fatigue and stock blind spots holding you back?',
    featureTitle: 'The Struggle',
    featureDescription: 'Manual tracking is slow, error-prone, and costs you money.',
    icon: Package,
    animation: require('../assets/designs/man-in-business.json'),
  },
  {
    id: '2',
    badge: 'Efficiency Redefined',
    title: 'AI Business Companion',
    description: 'Scale your enterprise with professional AI insights and precise data.',
    featureTitle: 'Smart Sales & Inventory',
    featureDescription: 'Track revenue and never run out of stock with automated alerts.',
    icon: LineChart,
    animation: require('../assets/designs/phone-animation.json'),
  },
  {
    id: '3',
    badge: 'Call To Action',
    title: 'Ready to Grow?',
    description: 'Join thousands of successful merchants growing with BizSawa.',
    featureTitle: 'Instant Setup',
    featureDescription: 'Get started in minutes. No credit card required.',
    icon: BrainCircuit,
    animation: require('../assets/designs/finance.json'),
  },
];

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<FlatList>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleNext = async () => {
    if (currentIndex < ONBOARDING_DATA.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
    } else {
      await finishOnboarding();
    }
  };

  const finishOnboarding = async () => {
    try {
      await AsyncStorage.setItem('HAS_FINISHED_ONBOARDING', 'true');
      router.replace('/auth/login');
    } catch (error) {
      router.replace('/auth/login');
    }
  };

  const updateCurrentIndex = (e: any) => {
    const contentOffsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / width);
    setCurrentIndex(index);
  };

  const renderItem = ({ item }: { item: typeof ONBOARDING_DATA[0] }) => {
    const IconComponent = item.icon;
    
    return (
      <View style={{ width }} className="flex-1 px-6 pt-2 pb-[230px]">
        {/* Animation at the top (without background box) */}
        <View className="flex-1 w-full min-h-[150px] mb-6 items-center justify-center">
          <LottieView
            source={item.animation}
            autoPlay
            loop
            style={{ width: '100%', height: '100%' }}
            resizeMode="contain"
          />
        </View>

        {/* Header Section */}
        <View className="mb-6 max-w-sm">
          <View className="flex-row items-center bg-[#50616b]/5 self-start px-3 py-1.5 rounded-full mb-4 border border-[#73787b]/20">
            <View className="w-1.5 h-1.5 bg-[#006b5f] rounded-full mr-2" />
            <Text className="text-[10px] font-bold text-[#43474b] tracking-widest uppercase">{item.badge}</Text>
          </View>
          <Text className="text-3xl font-bold text-[#131b2e] mb-3 leading-tight">{item.title}</Text>
          <Text className="text-[#43474b] text-base leading-relaxed">{item.description}</Text>
        </View>

        {/* Feature Card */}
        <View 
          className="bg-white rounded-2xl p-6 border border-[#73787b]/10"
          style={{
            shadowColor: "#006b5f",
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.05,
            shadowRadius: 24,
            elevation: 2,
          }}
        >
          <View className="flex-row items-start gap-4">
            <View className="w-12 h-12 bg-[#006b5f]/5 rounded-xl items-center justify-center shrink-0">
              <IconComponent size={24} color="#006b5f" />
            </View>
            <View className="flex-1">
              <Text className="text-xl font-bold text-[#131b2e] mb-2">{item.featureTitle}</Text>
              <Text className="text-[#43474b] text-sm leading-relaxed">{item.featureDescription}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#faf8ff', paddingTop: insets.top }}>
      {/* Top Navigation Bar */}
      <View className="flex-row items-center justify-between px-6 py-4 z-50">
        <View className="flex-row items-center">
          <Image 
            source={require('../assets/adaptive-icon.png')} 
            style={{ width: 32, height: 32 }} 
            resizeMode="contain" 
          />
          <Text className="ml-2 font-bold text-2xl text-[#131b2e] tracking-tight">BizSawa</Text>
        </View>
        <TouchableOpacity className="p-2">
          <HelpCircle size={24} color="#5c5f61" />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={ONBOARDING_DATA}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={updateCurrentIndex}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={32}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 160 }}
      />

      {/* Fixed Bottom Action Bar */}
      <View className="absolute bottom-0 left-0 w-full px-6 pb-8 pt-6" style={{ backgroundColor: '#faf8ff' }}>
        
        {/* Centered Pagination Dots */}
        <View className="flex-row justify-center items-center mb-6 space-x-3">
          {ONBOARDING_DATA.map((_, index) => {
            const opacity = scrollX.interpolate({
              inputRange: [(index - 1) * width, index * width, (index + 1) * width],
              outputRange: [0.3, 1, 0.3],
              extrapolate: 'clamp',
            });
            const scale = scrollX.interpolate({
              inputRange: [(index - 1) * width, index * width, (index + 1) * width],
              outputRange: [0.8, 1.2, 0.8],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={index}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: '#006b5f',
                  opacity,
                  transform: [{ scale }],
                }}
              />
            );
          })}
        </View>

        {/* Buttons: Conditional rendering based on the slide index */}
        <View className="flex-col gap-4">
          {currentIndex === 0 && (
            <>
              <TouchableOpacity 
                onPress={handleNext}
                className="w-full bg-[#006b5f] py-4 rounded-full flex-row items-center justify-center shadow-lg"
                style={{
                  shadowColor: "#006b5f",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.2,
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                <Text className="text-white font-bold text-lg mr-2">
                  Continue
                </Text>
                <ArrowRight size={20} color="white" />
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={finishOnboarding}
                className="w-full py-2 items-center justify-center"
              >
                <Text className="text-[#43474b] font-medium text-base">
                  Already have an account? <Text className="text-[#006b5f] font-bold">Sign In</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          {currentIndex === 1 && (
            <View className="flex-row items-center justify-between gap-4">
              <TouchableOpacity 
                onPress={finishOnboarding}
                className="w-1/3 py-4 items-center justify-center rounded-full border border-[#c3c7cb]/50 bg-white"
              >
                <Text className="text-[#43474b] font-bold text-base">Skip</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={handleNext}
                className="flex-1 bg-[#006b5f] py-4 rounded-full flex-row items-center justify-center shadow-lg"
                style={{
                  shadowColor: "#006b5f",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.2,
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                <Text className="text-white font-bold text-lg mr-2">
                  Next
                </Text>
                <ArrowRight size={20} color="white" />
              </TouchableOpacity>
            </View>
          )}

          {currentIndex === ONBOARDING_DATA.length - 1 && (
             <TouchableOpacity 
               onPress={finishOnboarding}
               className="w-full bg-[#006b5f] py-4 rounded-full flex-row items-center justify-center shadow-lg"
               style={{
                 shadowColor: "#006b5f",
                 shadowOffset: { width: 0, height: 4 },
                 shadowOpacity: 0.2,
                 shadowRadius: 8,
                 elevation: 4,
               }}
             >
               <Text className="text-white font-bold text-lg mr-2">
                 Get Started
               </Text>
               <ArrowRight size={20} color="white" />
             </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}
