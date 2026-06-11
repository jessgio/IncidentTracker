import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '../../../../../utils/supabase/server'
import { extractMentionedUserIds, commentTextToPlain } from '../../../../../lib/comment-mentions'
import {
  buildCommentMentionEmailHtml,
  commentMentionSubject,
} from '../../../../../lib/comment-mention-email'
import { getAppOrigin } from '../../../../../lib/app-origin'
import { isLarkConfigured, sendLarkText } from '../../../../../lib/lark'
import { buildCommentLarkText, commentToLarkPlain } from '../../../../../lib/lark-messages'

const resend = new Resend(process.env.RESEND_API_KEY)

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { id: incidentId } = await context.params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const commentText = typeof body.commentText === 'string' ? body.commentText.trim() : ''
    if (!commentText) {
      return NextResponse.json({ error: 'Comment cannot be empty.' }, { status: 400 })
    }
    if (commentText.length > 8000) {
      return NextResponse.json({ error: 'Comment is too long (max 8000 characters).' }, { status: 400 })
    }

    const { data: incident, error: incError } = await supabase
      .from('incidents')
      .select('id, title, order_number, status')
      .eq('id', incidentId)
      .single()

    if (incError || !incident) {
      return NextResponse.json({ error: 'Case not found.' }, { status: 404 })
    }

    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()

    const { data: comment, error: insertError } = await supabase
      .from('comments')
      .insert([{
        incident_id: incidentId,
        user_id: user.id,
        comment_text: commentText,
      }])
      .select('id')
      .single()

    if (insertError || !comment) {
      console.error('comment insert error:', insertError)
      return NextResponse.json({ error: 'Could not save comment.' }, { status: 500 })
    }

    const mentionIds = extractMentionedUserIds(commentText).filter(
      id => id.toLowerCase() !== user.id.toLowerCase()
    )

    const emailFailures: string[] = []
    let mentionsNotified = 0

    if (mentionIds.length > 0 && process.env.RESEND_API_KEY) {
      const { data: recipients } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', mentionIds)

      const withEmail = (recipients ?? []).filter(r => r.email)
      if (withEmail.length > 0) {
        const appOrigin =
          process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
          req.nextUrl.origin
        const caseUrl = `${appOrigin}/incidents/${incidentId}`
        const mentionerName = senderProfile?.full_name || senderProfile?.email || 'A team member'
        const commentPlain = commentTextToPlain(commentText)
        const from =
          process.env.MENTION_NOTIFY_FROM ||
          process.env.WAREHOUSE_NOTIFY_FROM ||
          process.env.REPORT_FROM ||
          'Incident Tracker <reports@aerisbeaute.com>'

        const html = buildCommentMentionEmailHtml({
          orderNumber: incident.order_number || 'N/A',
          caseTitle: incident.title,
          mentionerName,
          commentPlain,
          caseUrl,
        })
        const subject = commentMentionSubject(incident.order_number || 'N/A')

        await Promise.all(
          withEmail.map(async recipient => {
            const { error: emailError } = await resend.emails.send({
              from,
              to: [recipient.email as string],
              subject,
              html,
            })
            if (emailError) {
              console.error('mention email error:', recipient.email, emailError)
              emailFailures.push(recipient.email as string)
            } else {
              mentionsNotified += 1
            }
          })
        )
      }
    } else if (mentionIds.length > 0 && !process.env.RESEND_API_KEY) {
      emailFailures.push('(email not configured)')
    }

    let larkError: string | undefined
    if (isLarkConfigured('chat')) {
      const caseUrl = `${getAppOrigin(req.nextUrl.origin)}/incidents/${incidentId}`
      const authorName = senderProfile?.full_name || senderProfile?.email || 'A team member'
      const larkText = buildCommentLarkText({
        orderNumber: incident.order_number || 'N/A',
        caseTitle: incident.title,
        status: incident.status || 'Unknown',
        authorName,
        commentPlain: commentToLarkPlain(commentText),
        caseUrl,
      })
      const larkResult = await sendLarkText(larkText, { webhookKind: 'chat' })
      if (!larkResult.ok) {
        console.error('Lark comment notify failed:', larkResult.error)
        larkError = larkResult.error
      }
    }

    return NextResponse.json({
      success: true,
      commentId: comment.id,
      mentionsNotified,
      emailFailures: emailFailures.length > 0 ? emailFailures : undefined,
      larkError,
    })
  } catch (err) {
    console.error('comments POST error:', err)
    return NextResponse.json({ error: 'Could not post comment.' }, { status: 500 })
  }
}
