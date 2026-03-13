/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import Welcome from './pages/user/Welcome';
import UserLogin from './pages/user/Login';
import UserSignup from './pages/user/Signup';
import UserDashboard from './pages/user/Dashboard';
import Callback from './pages/user/Callback';
import VerifyCode from './pages/user/VerifyCode';
import AdminLogin from './pages/admin/Login';
import AdminDashboard from './pages/admin/Dashboard';

export default function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          {/* User Routes */}
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/login" element={<UserLogin />} />
          <Route path="/signup" element={<UserSignup />} />
          <Route path="/verify-code" element={<VerifyCode />} />
          <Route path="/callback" element={<Callback />} />
          <Route path="/dashboard" element={<UserDashboard />} />
          <Route path="/" element={<Navigate to="/welcome" replace />} />

          {/* Admin Routes */}
          <Route path="/meta" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}
