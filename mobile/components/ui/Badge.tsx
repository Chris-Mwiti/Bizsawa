import React from "react";
import { View, Text, ViewProps } from "react-native";

interface BadgeProps extends ViewProps {
  variant?: "default" | "outline" | "secondary" | "destructive";
  children: React.ReactNode;
  textClassName?: string;
}

export function Badge({
  variant = "default",
  className,
  textClassName,
  children,
  ...props
}: BadgeProps) {
  let bgClass = "bg-gray-900";
  let textClass = "text-white";
  let borderClass = "";

  switch (variant) {
    case "outline":
      bgClass = "bg-transparent";
      textClass = "text-gray-700";
      borderClass = "border border-gray-200";
      break;
    case "secondary":
      bgClass = "bg-blue-100";
      textClass = "text-blue-700";
      break;
    case "destructive":
      bgClass = "bg-red-100";
      textClass = "text-red-700";
      break;
    case "default":
      if (className?.includes("bg-green-100")) {
        bgClass = "bg-green-100";
        textClass = "text-green-700";
      }
      break;
  }

  // Helper to ensure all fragments of text are wrapped
  const renderChildren = () => {
    if (typeof children === "string" || typeof children === "number") {
      return (
        <Text
          className={`text-xs font-medium ${textClass} ${textClassName || ""}`}
        >
          {children}
        </Text>
      );
    }
    return children;
  };

  return (
    <View
      className={`px-2 py-0.5 rounded-full items-center justify-center ${bgClass} ${borderClass} ${className || ""}`}
      {...props}
    >
      {renderChildren()}
    </View>
  );
}
