// communityhub/hub_modules/notifications.api.js (DIAGNOSTIC)
export async function getCurrentUserId(supabase) {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data?.user?.id || null;
}

export async function fetchUnreadNotifications(supabase, userId, limit = 40) {
  console.log('🔔 fetchUnreadNotifications', { userId, limit });
  const { data, error } = await supabase
    .from('v_notifications_for_bell')
    .select('id, recipient_user_id, actor_user_id, actor_name, actor_avatar_url, type, entity_type, entity_id, conversation_id, snippet, read_at, created_at')
    .eq('recipient_user_id', userId)
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  console.log('🔔 fetched', data?.length ?? 0, 'rows');
  return data || [];
}

export async function markOneRead(supabase, notificationId, recipientUserId) {
  console.log('🔔 markOneRead', { notificationId, recipientUserId });
  const { error } = await supabase.rpc('fn_notification_mark_read', {
    _notification_id: notificationId,
    _recipient: recipientUserId
  });
  if (error) { console.error('markOneRead error', error); throw error; }
  return true;
}

export async function markAllRead(supabase, recipientUserId) {
  console.log('🔔 markAllRead', { recipientUserId });
  const { error } = await supabase.rpc('fn_notifications_mark_all_read', {
    _recipient: recipientUserId
  });
  if (error) { console.error('markAllRead error', error); throw error; }
  return true;
}

export function labelForNotification(n) {
  switch (n.type) {
    case 'message': return 'New message';
    case 'bulletin_comment': return 'Bulletin comment';
    case 'help_comment': return 'Help comment';
    case 'id_request_comment': return 'ID Request comment';
    case 'user_review': return 'New review about you';
    case 'store_review': return 'New store review';
    case 'user_review_comment': return 'Comment on your user review';
    case 'store_review_comment': return 'Comment on your store review';
    default: return n.type;
  }
}

export function destinationForNotification(n) {
  if (n.type === 'message' && n.conversation_id) {
    return `/communityhub/hub.html?module=messages#conv/${n.conversation_id}`;
  }
  if (n.entity_type === 'bulletin_comments' || n.entity_type === 'bulletins') {
    return `/communityhub/hub.html?module=bulletins#id/${n.entity_id}`;
  }
  return '#';
}
