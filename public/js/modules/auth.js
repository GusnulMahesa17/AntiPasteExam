/**
 * AntiPasteExam — Authentication Module
 */
export function createAuthModule(api, toast) {
  return {
    token: localStorage.getItem('token') || '',
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    authMode: 'login', // 'login' | 'register'
    authForm: {
      name: '',
      email: '',
      password: '',
      role: 'student',
    },

    async handleAuth() {
      try {
        const endpoint = this.authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
        const data = await api(endpoint, {
          method: 'POST',
          body: JSON.stringify(this.authForm),
        });

        this.token = data.token;
        this.user = data.user;
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));

        toast(`Welcome, ${data.user.name}!`, 'success');
        return data.user;
      } catch (err) {
        return null;
      }
    },

    fillDemoCredentials(role) {
      if (role === 'teacher') {
        this.authForm = {
          name: 'Prof. Alex Johnson',
          email: 'teacher@demo.com',
          password: 'password123',
          role: 'teacher',
        };
      } else {
        this.authForm = {
          name: 'Jane Doe',
          email: 'student@demo.com',
          password: 'password123',
          role: 'student',
        };
      }
    },

    logout() {
      this.token = '';
      this.user = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      toast('Signed out successfully', 'info');
    },
  };
}
