import { type RouteConfig, index, route } from "@react-router/dev/routes";
// import { Route } from "react-router";
// import { routes } from "virtual:react-router/server-build";

export default [
    index("routes/home.tsx"),
    route('/auth', 'routes/auth.tsx'),
    route('/upload', 'routes/upload.tsx'),
    route('/resume/:id', 'routes/resume.tsx'),
] satisfies RouteConfig;
