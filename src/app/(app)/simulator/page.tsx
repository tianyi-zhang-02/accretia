import { redirect } from 'next/navigation';

/**
 * The simulator is now the home screen (`/`). This route stays as a
 * permanent redirect so old bookmarks, the Settings link, and any docs
 * pointing at /simulator keep working.
 */
export default function SimulatorRedirect() {
  redirect('/');
}
