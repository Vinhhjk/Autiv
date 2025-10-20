import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import App from '../src/App'
import PaymentWindow from '../src/pages/PaymentWindow'

const MissingPaymentSession = () => (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#f0f0f0' }}>
        <div className="bg-white p-10 text-center" style={{ border: '4px solid #000000', boxShadow: '12px 12px 0px #000000, 24px 24px 0px #e0e0e0' }}>
            <h1 className="text-3xl font-black text-black mb-4">Payment session required</h1>
            <p className="text-gray-700 font-semibold">
                Please open this page from a valid Autiv checkout link (e.g. <code>/pay/&lt;paymentId&gt;</code>).
            </p>
        </div>
    </div>
)

const router = createBrowserRouter([
    {
        path: '/',
        element: <App />,
        errorElement: <MissingPaymentSession />,
        children: [
            {
                index: true,
                element: <MissingPaymentSession />
            },
            {
                path: 'pay/:paymentId',
                element: <PaymentWindow />
            },
            {
                path: '*',
                element: <Navigate to="/" replace />
            }
        ]
    }
])

export default function Router() {
    return <RouterProvider router={router} />
}

