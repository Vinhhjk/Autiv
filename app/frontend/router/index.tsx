import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import App from '../src/App'
import Landing from '../src/pages/Landing'
import Demo from '../src/pages/Demo'
import Home from '../src/pages/Home'
import Developers from '../src/pages/Developers'
import ProjectDetail from '../src/pages/ProjectDetail'
import ApiKeysManagement from '../src/pages/ApiKeysManagement'
import ManageSubscription from '../src/components/ManageSubscription'
import Analytics from '../src/components/Analytics'
import HomeDevelopers from '../src/components/Developers'
import Docs from '../src/components/Docs'

// Define your routes configuration
const router = createBrowserRouter([
    {
        path: '/',
        element: <App />,
        errorElement: <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
                <h1 className="text-2xl font-bold text-gray-800 mb-4">Oops! Something went wrong</h1>
                <p className="text-gray-600 mb-4">The page you're looking for doesn't exist.</p>
                <Navigate to="/" replace />
            </div>
        </div>,
        children: [
            {
                index: true,
                element: <Landing />
            },
            {
                path: 'demo',
                element: <Demo />
            },
            {
                path: 'docs',
                element: <Docs />
            },
            {
                path: 'home',
                element: <Home />,
                children: [
                    {
                        index: true,
                        element: <Navigate to="/home/manage-subscription" replace />
                    },
                    {
                        path: 'manage-subscription',
                        element: <ManageSubscription />
                    },
                    {
                        path: 'analytics',
                        element: <Analytics />
                    },
                    {
                        path: 'developers',
                        element: <HomeDevelopers />
                    },
                    {
                        path: 'developers/api-keys',
                        element: <ApiKeysManagement />
                    },
                    {
                        path: 'developers/projects/:projectId',
                        element: <ProjectDetail />
                    }
                ]
            },
            {
                path: 'developers',
                element: <Developers />
            },
            // Catch-all route for 404s
            {
                path: '*',
                element: <Navigate to="/" replace />
            }
        ]
    }
])

// Router component that can be used in main.tsx
export default function Router() {
    return <RouterProvider router={router} />
}

