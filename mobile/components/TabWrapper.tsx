import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Bot, Sparkles } from 'lucide-react-native';
import { router } from 'expo-router';
import { TAB_BAR_SCROLL_PADDING } from '../constants/tabBar';

interface TabWrapperProps {
  children: React.ReactNode;
}

export const TabWrapper: React.FC<TabWrapperProps> = ({ children }) => {
  const handleOpenAICoach = () => {
    router.push('/coach');
  };

  const handleOpenSocialMedia = () => {
    router.push('/social');
  };

  return (
    <View style={{ flex: 1 }}>
      {children}
      
      {/* AI Coach FAB */}
      <TouchableOpacity
        style={[styles.fab, styles.aiFab]}
        onPress={handleOpenAICoach}
        activeOpacity={0.8}
      >
        <Bot size={24} color="white" />
      </TouchableOpacity>

      {/* Social Media FAB */}
      <TouchableOpacity
        style={[styles.fab, styles.socialFab]}
        onPress={handleOpenSocialMedia}
        activeOpacity={0.8}
      >
        <Sparkles size={24} color="white" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1000,
  },
  aiFab: {
    backgroundColor: '#006b5f',
    bottom: TAB_BAR_SCROLL_PADDING,
    right: 20,
  },
  socialFab: {
    backgroundColor: '#00C4B4',
    bottom: TAB_BAR_SCROLL_PADDING + 70,
    right: 20,
  },
});
