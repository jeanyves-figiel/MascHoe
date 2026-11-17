import { BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNavigationContainerRef, DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { AppState, Linking, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api/client';
import { AlbumEditScreen, AlbumsScreen, AlbumViewScreen } from '../chat/AlbumScreens';
import { ChatScreen } from '../chat/ChatScreen';
import { on, unreadTotal } from '../chat/engine';
import { useTopics } from '../chat/hooks';
import { InboxScreen } from '../chat/InboxScreen';
import { PushPrompt } from '../chat/PushPrompt';
import { ExploreScreen } from '../explore/ExploreScreen';
import { tx } from '../i18n/app';
import { BlockedScreen } from '../me/BlockedScreen';
import { DevicesScreen } from '../me/DevicesScreen';
import { EditProfileScreen } from '../me/EditProfileScreen';
import { MeScreen } from '../me/MeScreen';
import { SettingsScreen } from '../me/SettingsScreen';
import { TapsScreen } from '../me/TapsScreen';
import { ProfileScreen } from '../profile/ProfileScreen';
import { VerifyScreen } from '../screens/Verify';
import { PartyNewScreen } from '../scene/PartyNewScreen';
import { PartyScreen } from '../scene/PartyScreen';
import { resyncHostGroups } from '../scene/groupSync';
import { ActivityNewScreen, ActivityScreen, ClubNewScreen, ClubScreen } from '../scene/SportScreens';
import { TonightScreen } from '../scene/TonightScreen';
import { AppLockScreen } from '../safety/AppLockScreen';
import { CheckinDueScreen, CheckinStartScreen } from '../safety/CheckinScreens';
import { LockGate } from '../safety/LockGate';
import { SafeModeAuto } from '../safety/SafeModeAuto';
import { loadPrefs, prefs } from '../me/prefs';
import { active as activeCheckin, refreshCheckin } from '../safety/safety';
import { SafetyScreen } from '../safety/SafetyScreen';
import { NoticesScreen } from '../trust/NoticesScreen';
import { ReportScreen } from '../trust/ReportScreen';
import { VenueScreen } from '../scene/VenueScreens';
import { color, modeColor, radius, space, type } from '../theme/tokens';
import { Icon, ModeContext } from '../ui';
import { useSession } from './session';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const navTheme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: color.bgBase, card: color.bgBase, primary: color.hookup, text: color.fgPrimary, border: color.line } };

const TAB_ICON: Record<string, (c: string) => React.ReactNode> = {
  Explore: (c) => <Icon.Pin c={c} />,
  Tonight: (c) => <Icon.Moon c={c} />,
  Chats: (c) => <Icon.Chat c={c} />,
  Me: (c) => <Icon.User c={c} />,
};

// Pop bottom nav (App v2): white floating pill, icons; active tab grows, shows its label and fills with the mode colour.
function PillBar({ state, navigation }: BottomTabBarProps) {
  const { mode } = useSession();
  const insets = useSafeAreaInsets();
  useTopics('convs');
  const unread = unreadTotal();
  const labels: Record<string, string> = { Explore: tx.tabs.explore, Tonight: tx.tabs.tonight, Chats: tx.tabs.chats, Me: tx.tabs.me };
  return (
    <View
      accessibilityRole="tablist"
      style={{ position: 'absolute', left: space.l, right: space.l, bottom: insets.bottom + space.s, flexDirection: 'row', backgroundColor: color.bgInverse, borderRadius: radius.pill, padding: 6, gap: 4, maxWidth: 520, shadowColor: color.bgBase, shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 12, alignSelf: 'center' }}
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
              if (Platform.OS !== 'web' && prefs().haptics) Haptics.selectionAsync().catch(() => {});
              if (!on) navigation.navigate(r.name);
            }}
            style={{ flex: on ? 1.6 : 1, height: 52, borderRadius: radius.pill, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? modeColor[mode] : 'transparent' }}
          >
            {TAB_ICON[r.name]?.(on ? color.onAccent : color.navInactive)}
            {on ? <Text style={{ ...type.headline, fontSize: 13, color: color.onAccent }}>{labels[r.name]}</Text> : null}
            {r.name === 'Chats' && unread > 0 && !on ? (
              <View testID="chats-badge" style={{ position: 'absolute', top: 4, right: 12, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: color.hookup, borderWidth: 2, borderColor: color.bgInverse, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ ...type.caption, fontSize: 10, color: color.onAccent }}>{unread}</Text>
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
      <Tab.Screen name="Tonight" component={TonightScreen as React.ComponentType} />
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

const nav = createNavigationContainerRef<Record<string, object | undefined>>();

/** F-13: open "All good?" once a check-in is due; keep the held alert's location fresh (5 min). */
function useCheckinWatch() {
  React.useEffect(() => {
    const check = async () => {
      const a = await activeCheckin().catch(() => null);
      if (!a) return;
      if (new Date(a.due).getTime() <= Date.now() && nav.isReady() && nav.getCurrentRoute()?.name !== 'CheckinDue') nav.navigate('CheckinDue');
    };
    const t1 = setInterval(check, 30_000);
    const t2 = setInterval(() => refreshCheckin().catch(() => {}), 5 * 60_000);
    const s = AppState.addEventListener('change', (st) => st === 'active' && check());
    let rm: (() => void) | undefined;
    if (Platform.OS !== 'web')
      import('expo-notifications').then((N) => {
        const sub = N.addNotificationResponseReceivedListener((r) => {
          if ((r.notification.request.content.data as { checkin?: boolean })?.checkin && nav.isReady()) nav.navigate('CheckinDue');
        });
        rm = () => sub.remove();
      });
    check();
    return () => {
      clearInterval(t1);
      clearInterval(t2);
      s.remove();
      rm?.();
    };
  }, []);
}

/** I-02 R-I02.3: thirstr://p/{slug} and https://<site>/p/{slug} open the profile. */
function useShareLinks() {
  React.useEffect(() => {
    const open = async (url: string | null | undefined) => {
      const m = url?.match(/(?:^thirstr:\/\/p\/|\/p\/)([a-z0-9]{10})(?:[/?#]|$)/);
      if (!m) return;
      const r = await api<{ profile_id: string }>('GET', `/share/${m[1]}`).catch(() => null);
      for (let i = 0; i < 20 && !nav.isReady(); i++) await new Promise((res) => setTimeout(res, 250));
      if (r && nav.isReady()) nav.navigate('Profile', { id: r.profile_id });
    };
    Linking.getInitialURL().then(open);
    const s = Linking.addEventListener('url', (e) => open(e.url));
    return () => s.remove();
  }, []);
}

const sub = { headerShown: true, title: '', headerStyle: { backgroundColor: color.bgBase }, headerTintColor: color.fgPrimary, headerShadowVisible: false };

export function Main() {
  const { mode } = useSession();
  // Hosts keep party / activity / club group chats in step with their member lists.
  React.useEffect(() => {
    loadPrefs();
    resyncHostGroups().catch(() => {});
    return on('scene', () => {
      resyncHostGroups().catch(() => {});
    });
  }, []);
  useCheckinWatch();
  useShareLinks();
  return (
    <ModeContext.Provider value={mode}>
      <LockGate>
      <NavigationContainer ref={nav} theme={navTheme}>
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bgBase } }}>
          <Stack.Screen name="Tabs" component={Tabs} />
          <Stack.Screen name="Profile" component={ProfileScreen as React.ComponentType} />
          <Stack.Screen name="EditProfile" component={EditProfileScreen as React.ComponentType} options={sub} />
          <Stack.Screen name="Settings" component={SettingsScreen as React.ComponentType} options={sub} />
          <Stack.Screen name="Blocked" component={BlockedScreen} options={sub} />
          <Stack.Screen name="Taps" component={TapsScreen as React.ComponentType} options={sub} />
          <Stack.Screen name="Verify" component={VerifyRoute as React.ComponentType} />
          <Stack.Screen name="Chat" component={ChatScreen as React.ComponentType} />
          <Stack.Screen name="Albums" component={AlbumsScreen as React.ComponentType} options={sub} />
          <Stack.Screen name="AlbumEdit" component={AlbumEditScreen as React.ComponentType} options={sub} />
          <Stack.Screen name="Album" component={AlbumViewScreen as React.ComponentType} options={sub} />
          <Stack.Screen name="Party" component={PartyScreen as React.ComponentType} options={sub} />
          <Stack.Screen name="PartyNew" component={PartyNewScreen as React.ComponentType} options={sub} />
          <Stack.Screen name="Activity" component={ActivityScreen as React.ComponentType} options={sub} />
          <Stack.Screen name="ActivityNew" component={ActivityNewScreen as React.ComponentType} options={sub} />
          <Stack.Screen name="Club" component={ClubScreen as React.ComponentType} options={sub} />
          <Stack.Screen name="ClubNew" component={ClubNewScreen as React.ComponentType} options={sub} />
          <Stack.Screen name="Venue" component={VenueScreen as React.ComponentType} options={sub} />
          <Stack.Screen name="Report" component={ReportScreen as React.ComponentType} options={sub} />
          <Stack.Screen name="Notices" component={NoticesScreen} options={sub} />
          <Stack.Screen name="Safety" component={SafetyScreen as React.ComponentType} options={sub} />
          <Stack.Screen name="CheckinStart" component={CheckinStartScreen as React.ComponentType} options={sub} />
          <Stack.Screen name="CheckinDue" component={CheckinDueScreen as React.ComponentType} options={sub} />
          <Stack.Screen name="AppLock" component={AppLockScreen} options={sub} />
          <Stack.Screen name="Devices" component={DevicesScreen} options={sub} />
        </Stack.Navigator>
        <PushPrompt />
        <SafeModeAuto navigate={(r) => nav.isReady() && nav.navigate(r)} />
      </NavigationContainer>
      </LockGate>
    </ModeContext.Provider>
  );
}
