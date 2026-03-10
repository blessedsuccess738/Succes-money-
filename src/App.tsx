/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import UserLogin from './pages/user/Login';
import UserSignup from './pages/user/Signup';
import UserDashboard from './pages/user/Dashboard';
import ConnectBroker from './pages/user/ConnectBroker';
import Callback from './pages/user/Callback';
import AdminLogin from './pages/admin/Login';
import AdminDashboard from './pages/admin/Dashboard';

export default function App() {
  return (
    <Router>
      <Routes>
        {/* User Routes */}
        <Route path="/login" element={<UserLogin />} />
        <Route path="/signup" element={<UserSignup />} />
        <Route path="/connect-broker" element={<ConnectBroker />} />
        <Route path="/callback" element={<Callback />} />
        <Route path="/dashboard" element={<UserDashboard />} />
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Admin Routes */}
        <Route path="/meta" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </Router>
  );
}
