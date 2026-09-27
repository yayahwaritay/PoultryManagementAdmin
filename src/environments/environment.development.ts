// Dev environment. Requests to /api/* are forwarded to the ASP.NET Core backend
// by proxy.conf.json (see that file to point `target` at your local backend port).
export const environment = {
  production: false,
  apiUrl: 'https://poultrymanagementapi.onrender.com/api',
};
