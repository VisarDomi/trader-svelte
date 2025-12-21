export type NotificationType = 'success' | 'error' | 'info';

export interface Notification {
    id: string;
    type: NotificationType;
    message: string;
    timeout?: number;
}

class NotificationService {
    items = $state<Notification[]>([]);

    add(type: NotificationType, message: string, timeout = 3000) {
        const id = crypto.randomUUID();
        const note: Notification = { id, type, message, timeout };
        this.items.push(note);

        if (timeout > 0) {
            setTimeout(() => {
                this.remove(id);
            }, timeout);
        }
    }

    success(message: string) {
        this.add('success', message);
    }

    error(message: string) {
        this.add('error', message, 5000);
    }

    info(message: string) {
        this.add('info', message);
    }

    remove(id: string) {
        this.items = this.items.filter(n => n.id !== id);
    }
}

export const notifications = new NotificationService();