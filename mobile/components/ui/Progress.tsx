import React from 'react';
import { View, ViewProps } from 'react-native';

interface ProgressProps extends ViewProps {
  value: number;
}

export function Progress({ value, className, ...props }: ProgressProps) {
  return (
    <View className={`h-2 w-full bg-gray-100 rounded-full overflow-hidden ${className || ''}`} {...props}>
      <View 
        className="h-full bg-gray-900 rounded-full" 
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} 
      />
    </View>
  );
}
