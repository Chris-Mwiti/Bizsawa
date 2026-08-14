import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const COLORS = {
  surface: "#f8f9fa",
  secondary: "#555f6d",
  primary: "#630ed4",
  homeActiveBg: "#006b5f",
  homeIdleBg: "#e7e8e9",
  onPrimary: "#ffffff",
  borderCutout: "#f8f9fa",
} as const;

const ICON_SIZE = 24;
const LABEL_SIZE = 12;
const HOME_CIRCLE = 56;
const HOME_LIFT = -28;

type RouteName = "sales" | "stock" | "index" | "insights" | "profile";

function TabIcon({
  routeName,
  focused,
}: {
  routeName: RouteName;
  focused: boolean;
}) {
  const inactiveColor = COLORS.secondary;
  const activeColor = COLORS.primary;

  switch (routeName) {
    case "sales":
      return (
        <MaterialCommunityIcons
          name={focused ? "cash-register" : "cash-register"}
          size={ICON_SIZE}
          color={focused ? activeColor : inactiveColor}
        />
      );
    case "stock":
      return (
        <MaterialCommunityIcons
          name={focused ? "package-variant" : "package-variant"}
          size={ICON_SIZE}
          color={focused ? activeColor : inactiveColor}
        />
      );
    case "insights":
      return (
        <MaterialCommunityIcons
          name={focused ? "chart-line" : "chart-line"}
          size={ICON_SIZE}
          color={focused ? activeColor : inactiveColor}
        />
      );
    case "profile":
      return (
        <MaterialCommunityIcons
          name={focused ? "account" : "account-outline"}
          size={ICON_SIZE}
          color={focused ? activeColor : inactiveColor}
        />
      );
    default:
      return null;
  }
}

export function AppTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  /** Safe area + breathing room above system home indicator */
  const bottomPad = Math.max(insets.bottom, 12) + 10;

  return (
    <View
      style={[
        styles.outer,
        {
          paddingBottom: bottomPad,
        },
      ]}
    >
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const routeName = route.name as RouteName;
          const isFocused = state.index === index;
          const label =
            typeof options.title === "string"
              ? options.title
              : route.name === "index"
                ? ""
                : route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          if (routeName === "index") {
            const homeFocused = isFocused;
            return (
              <View key={route.key} style={styles.homeSlot}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: homeFocused }}
                  accessibilityLabel={options.title ?? "Home"}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  android_ripple={
                    homeFocused
                      ? { color: "rgba(255,255,255,0.22)", foreground: true }
                      : { color: "rgba(0,0,0,0.08)", foreground: true }
                  }
                  style={styles.homePressable}
                >
                  {({ pressed }) => (
                    <View
                      style={[
                        styles.homeCircle,
                        homeFocused
                          ? styles.homeCircleActive
                          : styles.homeCircleIdle,
                        pressed && styles.homePressed,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="home"
                        size={26}
                        color={homeFocused ? COLORS.onPrimary : COLORS.secondary}
                      />
                    </View>
                  )}
                </Pressable>
              </View>
            );
          }

          const secondaryFocused = isFocused;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={{ selected: secondaryFocused }}
              accessibilityLabel={options.title}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [
                styles.sideTab,
                secondaryFocused && styles.sideTabActive,
                !secondaryFocused && styles.sideTabInactive,
                pressed && styles.pressedDim,
              ]}
            >
              <View style={styles.sideTabContent}>
                <View style={styles.iconWrap}>
                  <TabIcon routeName={routeName} focused={secondaryFocused} />
                </View>
                <Text
                  style={[
                    styles.label,
                    secondaryFocused ? styles.labelActive : styles.labelInactive,
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    overflow: "visible",
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingBottom: 4,
    minHeight: 56,
    overflow: "visible",
  },
  sideTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingVertical: 8,
    paddingHorizontal: 4,
    maxWidth: 88,
  },
  sideTabActive: {
    transform: [{ scale: 1.08 }],
  },
  sideTabInactive: {
    opacity: 0.7,
  },
  sideTabContent: {
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  iconWrap: {
    marginBottom: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: LABEL_SIZE,
    lineHeight: 16,
    letterSpacing: 0.2,
    fontWeight: "500",
    textAlign: "center",
    alignSelf: "stretch",
  },
  labelActive: {
    color: COLORS.primary,
  },
  labelInactive: {
    color: COLORS.secondary,
  },
  homeSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: HOME_LIFT,
    maxWidth: 88,
    overflow: "visible",
  },
  homePressable: {
    borderRadius: HOME_CIRCLE / 2 + 4,
    overflow: "visible",
  },
  homeCircle: {
    width: HOME_CIRCLE,
    height: HOME_CIRCLE,
    borderRadius: HOME_CIRCLE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: COLORS.borderCutout,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  homeCircleIdle: {
    backgroundColor: COLORS.homeIdleBg,
  },
  homeCircleActive: {
    backgroundColor: COLORS.homeActiveBg,
  },
  homePressed: {
    opacity: 0.9,
  },
  pressedDim: {
    opacity: 0.92,
  },
});
