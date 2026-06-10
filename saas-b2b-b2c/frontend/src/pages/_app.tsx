import React from 'react';
import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import { store } from '../store';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import ThemeProvider from '../components/ThemeProvider';
import { ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import weekday from 'dayjs/plugin/weekday';
import localeData from 'dayjs/plugin/localeData';
import GreetingOverlay from '../components/GreetingOverlay/GreetingOverlay';

dayjs.locale('ru');
dayjs.extend(weekday);
dayjs.extend(localeData);

function MyApp({ Component, pageProps }: AppProps) {
  const [showChild, setShowChild] = useState(false);
  const [showGreeting, setShowGreeting] = useState(false);
  const [greetingUser, setGreetingUser] = useState({ firstName: '', lastName: '' });
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user && user.role) {
          store.dispatch({ type: 'auth/setAuthFromStorage' });
        }
      } catch (e) {
        console.error('Failed to parse user', e);
      }
    }
    setShowChild(true);
  }, []);

  useEffect(() => {
    if (!showChild) return;

    const flag = sessionStorage.getItem('showGreeting');
    if (flag === 'true') {
      sessionStorage.removeItem('showGreeting');
      try {
        const userStr = localStorage.getItem('user');
        const u = JSON.parse(userStr || '{}');
        setGreetingUser({ firstName: u.first_name || '', lastName: u.last_name || '' });
      } catch {
        // Игнорируем — покажем приветствие без имени
      }
      setShowGreeting(true);
    }
  }, [showChild, router.asPath]);

  if (!showChild) {
    return null;
  }

  return (
    <Provider store={store}>
      <ConfigProvider locale={ruRU}>
        <ThemeProvider>
          <Component {...pageProps} />
          {showGreeting && (
            <GreetingOverlay
              firstName={greetingUser.firstName}
              lastName={greetingUser.lastName}
              onComplete={() => setShowGreeting(false)}
            />
          )}
        </ThemeProvider>
      </ConfigProvider>
    </Provider>
  );
}

export default MyApp;
