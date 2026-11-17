import { BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatScreen } from '../chat/ChatScreen';
import { unreadTotal } from '../chat/engine';
import { useTopics } from '../chat/hooks';
import { InboxScreen } from '../chat/InboxScreen';
import { ExploreScreen } from '../explore/ExploreScreen';
import { tx } from '../i18n/app';
import { BlockedScreen } from '../me/BlockedScreen';
import { EditProfileScreen } from '../me/EditProfileScreen';
import { MeScreen } from '../me/MeScreen';
import { SettingsScreen } from '../me/SettingsScreen';
import { TapsScreen } from '../me/TapsScreen';
import { ProfileScreen } from '../profile/ProfileScreen';
import { VerifyScreen } from '../screens/Verify';
import { color, modeColor, radius, space, type } from '../theme/tokens';
import { ModeContext } from '../ui';
import { useSession } from './session';
import { Soon } from './Soon';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const navTheme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: color.bgBase, card: color.bgBase, primary: color.hookup, text: color.fgPrimary, border: color.line } };

// Pop bottom nav: white floating pill; active tab filled with the mode colour (design-system.md › Pop).
function PillBar({ state, navigation }: BottomTabBarProps) {
  const { mode } = useSession();
  const insets = useSafeAreaInsets();
  useTopics('convs');
  const unread = unreadTotal();
  const labels: Record<string, string> = { Explore: tx.tabs.explore, Tonight: tx.tabs.tonight, Chats: tx.tabs.chats, Me: tx.tabs.me };
  return (
    <View
      accessibilityRole="tablist"
      style={{ position: 'absolute', left: space.l, right: space.l, bottom: insets.bottom + space.s, flexDirection: 'row', backgroundColor: color.bgInverse, borderRadius: radius.pill, padding: 6, maxWidth: 520, alignSelf: 'center' }}
    >
      {state.routes.map((r, i) => {
        const on = state.index === i;
        return (
          <Pressable
            key={r.key}
            testID={`tab-${r.name}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={labels[r.name]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
              if (!on) navigation.navigate(r.name);
            }}
            style={{ flex: 1, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? modeColor[mode] : 'transparent' }}
          >
            <Text style={{ ...type.headline, fontSize: 14, color: on ? color.onAccent : color.navInactive }}>{labels[r.name]}</Text>
            {r.name === 'Chats' && unread > 0 ? (
              <View testID="chats-badge" style={{ position: 'absolute', top: 6, right: 14, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: color.hookup, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ ...type.caption, fontSize: 10, color: color.fgPrimary }}>{unread}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function Tabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bgBase } }} tabBar={(p) => <PillBar {...p} />}>
      <Tab.Screen name="Explore" component={ExploreScreen as React.ComponentType} />
      <Tab.Screen name="Tonight" component={Soon} />
      <Tab.Screen name="Chats" component={InboxScreen as React.ComponentType} />
      <Tab.Screen name="Me" component={MeScreen as React.ComponentType} />
    </Tab.Navigator>
  );
}

function VerifyRoute({ navigation }: { navigation: { goBack: () => void } }) {
  const { setMe } = useSession();
  return (
    <VerifyScreen
      onDone={(m) => {
        setMe(m);
        navigation.goBack();
      }}
    />
  );
}

const sub = { headerShown: true, title: '', headerStyle: { backgroundColor: color.bgBase }, headerTintColor: color.fgPrimary, headerShadowVisible: false };

export function Main() {
  const { mode } = useSession();
  return (
    <ModeContext.Provider value={mode}>
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bgBase } }}>
          <Stack.Screen name="Tabs" component={Tabs} />
          <Stack.Screen name="Profile" component={ProfileScreen as React.ComponentType} />
          <Stack.Screen name="EditProfile" component={EditProfileScreen as React.ComponentType} options={sub} />
          <Stack.Screen name="Settings" component={SettingsScreen as React.ComponentType} options={sub} />
          <Stack.Screen name="Blocked" component={BlockedScreen} options={sub} />
          <Stack.Screen name="Taps" component={TapsScreen as React.ComponentType} options={sub} />
          <Stack.Screen name="Verify" component={VerifyRoute as React.ComponentType} />
          <Stack.Screen name="Chat" component={ChatScreen as React.ComponentType} />
          <Stack.Screen name="Report" component={Soon} options={sub} />
        </Stack.Navigator>
      </NavigationContainer>
    </ModeContext.Provider>
  );
}
