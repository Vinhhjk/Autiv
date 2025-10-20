import { useNavigate, useLocation } from 'react-router-dom'
import { routes, type RoutePath } from '../constants/routes'

export function useNavigation() {
  const navigate = useNavigate()
  const location = useLocation()

  const navigateTo = (path: RoutePath) => {
    navigate(path)
  }

  const isCurrentPath = (path: RoutePath) => {
    return location.pathname === path
  }

  const goBack = () => {
    navigate(-1)
  }

  const goForward = () => {
    navigate(1)
  }

  return {
    navigateTo,
    isCurrentPath,
    goBack,
    goForward,
    currentPath: location.pathname as RoutePath,
    routes
  }
}