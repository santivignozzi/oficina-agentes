import { OfficeApp } from '@/components/office-app'
import { isOnline } from '@/server/access'

// La página es estática: esto se decide al compilar. Por eso existe `build:online`.
export default function Page() {
  return <OfficeApp online={isOnline()} />
}
