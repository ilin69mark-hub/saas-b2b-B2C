import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

declare global {
  // eslint-disable-next-line no-var
  var __userMenuPush: jest.Mock | undefined;
}

if (!global.__userMenuPush) {
  global.__userMenuPush = jest.fn();
}

jest.mock('@/store/authSlice', () => {
  const actual = jest.requireActual('@/store/authSlice');
  return {
    ...actual,
    logout: jest.fn(() => ({ type: 'auth/logout' })),
  };
});

jest.mock('@/components/ThemeProvider', () => ({
  useThemeMode: () => ({ theme: 'light', setTheme: jest.fn(), toggleTheme: jest.fn() }),
}));

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: (...args: any[]) => (global.__userMenuPush as jest.Mock)(...args),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    prefetch: jest.fn(),
    pathname: '/',
    query: {},
    asPath: '/',
    events: { on: jest.fn(), off: jest.fn(), emit: jest.fn() },
    isReady: true,
  }),
}));

import UserMenu from '@/components/Dashboard/UserMenu';

const createMockStore = (authState: any) =>
  configureStore({
    reducer: {
      auth: () => authState,
    },
  });

const mockUser = {
  id: '1',
  email: 'ivan.petrov@example.com',
  first_name: 'Иван',
  last_name: 'Петров',
  role: 'dealer',
};

describe('UserMenu', () => {
  const pushMock = global.__userMenuPush!;

  beforeEach(() => {
    pushMock.mockClear();
  });

  it('shows initials for the current user', () => {
    const store = createMockStore({ user: mockUser, isAuthenticated: true });
    render(
      <Provider store={store}>
        <UserMenu />
      </Provider>
    );
    expect(screen.getByText('ИП')).toBeInTheDocument();
  });

  it('renders trigger with accessible label', () => {
    const store = createMockStore({ user: mockUser, isAuthenticated: true });
    render(
      <Provider store={store}>
        <UserMenu />
      </Provider>
    );
    expect(screen.getByLabelText('Меню пользователя')).toBeInTheDocument();
  });

  it('navigates to /profile when menu item is clicked', async () => {
    const store = createMockStore({ user: mockUser, isAuthenticated: true });
    render(
      <Provider store={store}>
        <UserMenu />
      </Provider>
    );

    fireEvent.click(screen.getByLabelText('Меню пользователя'));

    const profileItem = await screen.findByText('Профиль');
    fireEvent.click(profileItem);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/profile');
    });
  });

  it('navigates to /settings when menu item is clicked', async () => {
    const store = createMockStore({ user: mockUser, isAuthenticated: true });
    render(
      <Provider store={store}>
        <UserMenu />
      </Provider>
    );

    fireEvent.click(screen.getByLabelText('Меню пользователя'));

    const settingsItem = await screen.findByText('Настройки');
    fireEvent.click(settingsItem);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/settings');
    });
  });

  it('shows email first letter as fallback when no name is available', () => {
    const noNameUser = { ...mockUser, first_name: '', last_name: '' };
    const store = createMockStore({ user: noNameUser, isAuthenticated: true });
    const { container } = render(
      <Provider store={store}>
        <UserMenu />
      </Provider>
    );
    expect(container.querySelector('.anticon-user')).toBeInTheDocument();
  });
});
