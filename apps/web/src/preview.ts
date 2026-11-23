export const isPagesDemo = import.meta.env.MODE === 'pages';
export const homePath = import.meta.env.BASE_URL;
export const managementPath = `${homePath}gestion${isPagesDemo ? '/' : ''}`;
