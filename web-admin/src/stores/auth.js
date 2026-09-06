import { defineStore } from 'pinia';
import { login as apiLogin, loginByPhone as apiLoginByPhone } from '../api';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('panorama_token') || '',
    user: JSON.parse(localStorage.getItem('panorama_user') || 'null'),
  }),
  getters: {
    isLoggedIn: (state) => !!state.token,
    isAdmin: (state) => state.user?.role === 'admin',
    isOperator: (state) => state.user?.role === 'operator',
  },
  actions: {
    async login(username, password) {
      const data = await apiLogin({ username, password });
      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('panorama_token', data.token);
      localStorage.setItem('panorama_user', JSON.stringify(data.user));
      return data;
    },
    async loginByPhone(phone, code) {
      const data = await apiLoginByPhone({ phone, code });
      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('panorama_token', data.token);
      localStorage.setItem('panorama_user', JSON.stringify(data.user));
      return data;
    },
    logout() {
      this.token = '';
      this.user = null;
      localStorage.removeItem('panorama_token');
      localStorage.removeItem('panorama_user');
    },
  },
});
