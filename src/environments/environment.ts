// Production environment. When this admin app is deployed separately from the
// ASP.NET Core backend (see BACKEND-README.md), point apiUrl at the deployed
// API's absolute origin, e.g. 'https://api.jolivepoultryfarm.com/api'.
// Left relative here so it also works when both are served behind the same reverse proxy.
export const environment = {
  production: true,
  apiUrl: 'http://localhost:5165/api',
};
