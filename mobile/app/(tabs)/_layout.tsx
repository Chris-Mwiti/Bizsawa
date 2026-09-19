import '../../global.css'
import { Tabs } from 'expo-router'
import { AppTabBar } from '../../components/AppTabBar'
import { TabWrapper } from '../../components/TabWrapper'
import { SwipeContainer } from '../../components/SwipeContainer'
import { useSwipeNavigation } from '../../hooks/useSwipeNavigation'

const TAB_ROUTES = [
  { key: 'sales', href: '/(tabs)/sales', name: 'sales' },
  { key: 'stock', href: '/(tabs)/stock', name: 'stock' },
  { key: 'index', href: '/(tabs)', name: 'index' },
  { key: 'insights', href: '/(tabs)/insights/overview', name: 'insights' },
  { key: 'profile', href: '/(tabs)/profile', name: 'profile' },
] as const

export default function TabsLayout() {
  const { swipe } = useSwipeNavigation([...TAB_ROUTES])

  return (
    <TabWrapper>
      <SwipeContainer
        onSwipeLeft={() => swipe('left')}
        onSwipeRight={() => swipe('right')}
      >
        <Tabs
          tabBar={(props) => <AppTabBar {...props} />}
          screenOptions={{
            headerShown: true,
            tabBarShowLabel: false,
            tabBarStyle: {
              overflow: 'visible',
              backgroundColor: 'transparent',
              borderTopWidth: 0,
              elevation: 0,
            },
          }}
        >
          <Tabs.Screen name='sales' options={{ title: 'Sales' }} />
          <Tabs.Screen name='stock' options={{ title: 'Stock' }} />
          <Tabs.Screen name='index' options={{ title: 'Home' }} />
          <Tabs.Screen name='insights' options={{ title: 'Insight' }} />
          <Tabs.Screen name='profile' options={{ title: 'Profile' }} />
        </Tabs>
      </SwipeContainer>
    </TabWrapper>
  )
}
