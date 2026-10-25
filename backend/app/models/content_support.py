"""Public editorial snapshots and private append-only support conversations."""
from datetime import datetime
from sqlalchemy import DateTime,ForeignKey,String,Text,LargeBinary,UniqueConstraint,func
from sqlalchemy.orm import Mapped,mapped_column
from app.database import Base


class ContentItem(Base):
    __tablename__='content_items'
    id:Mapped[int]=mapped_column(primary_key=True)
    kind:Mapped[str]=mapped_column(String(20))
    latest_version:Mapped[int]=mapped_column(default=0)


class PublicMedia(Base):
    __tablename__='public_media'
    id:Mapped[int]=mapped_column(primary_key=True)
    content:Mapped[bytes]=mapped_column(LargeBinary)
    content_type:Mapped[str]=mapped_column(String(20))
    sha256:Mapped[str]=mapped_column(String(64))
    scan_engine:Mapped[str]=mapped_column(String(100))
    alt:Mapped[str]=mapped_column(String(300))
    rights_note:Mapped[str]=mapped_column(String(500))
    actor_id:Mapped[int]=mapped_column(ForeignKey('users.id',ondelete='RESTRICT'))
    request_key:Mapped[str]=mapped_column(String(36),unique=True)
    recorded_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())


class ContentVersion(Base):
    __tablename__='content_versions'
    id:Mapped[int]=mapped_column(primary_key=True)
    item_id:Mapped[int]=mapped_column(ForeignKey('content_items.id',ondelete='RESTRICT'),index=True)
    version:Mapped[int]
    snapshot:Mapped[str]=mapped_column(Text)
    media_id:Mapped[int|None]=mapped_column(ForeignKey('public_media.id',ondelete='RESTRICT'),nullable=True)
    actor_id:Mapped[int]=mapped_column(ForeignKey('users.id',ondelete='RESTRICT'))
    actor_email:Mapped[str]=mapped_column(String(255))
    request_key:Mapped[str]=mapped_column(String(36),unique=True)
    request_snapshot:Mapped[str]=mapped_column(Text)
    recorded_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())
    __table_args__=(UniqueConstraint('item_id','version',name='uq_content_version'),)


class ContentEvent(Base):
    __tablename__='content_events'
    id:Mapped[int]=mapped_column(primary_key=True)
    version_id:Mapped[int]=mapped_column(ForeignKey('content_versions.id',ondelete='RESTRICT'),index=True)
    state:Mapped[str]=mapped_column(String(30))
    reason:Mapped[str]=mapped_column(String(1000))
    effective_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True),nullable=True)
    actor_id:Mapped[int]=mapped_column(ForeignKey('users.id',ondelete='RESTRICT'))
    actor_email:Mapped[str]=mapped_column(String(255))
    request_key:Mapped[str]=mapped_column(String(36),unique=True)
    request_snapshot:Mapped[str]=mapped_column(Text)
    recorded_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())


class SupportTicket(Base):
    __tablename__='support_tickets'
    id:Mapped[int]=mapped_column(primary_key=True)
    number:Mapped[str]=mapped_column(String(40),unique=True)
    user_id:Mapped[int]=mapped_column(ForeignKey('users.id',ondelete='RESTRICT'),index=True)
    category:Mapped[str]=mapped_column(String(30))
    subject:Mapped[str]=mapped_column(String(200))
    status:Mapped[str]=mapped_column(String(30))
    revision:Mapped[int]=mapped_column(default=0)
    assigned_to:Mapped[int|None]=mapped_column(ForeignKey('users.id',ondelete='RESTRICT'),nullable=True)
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())


class TicketEvent(Base):
    __tablename__='ticket_events'
    id:Mapped[int]=mapped_column(primary_key=True)
    ticket_id:Mapped[int]=mapped_column(ForeignKey('support_tickets.id',ondelete='RESTRICT'),index=True)
    action:Mapped[str]=mapped_column(String(30))
    status:Mapped[str]=mapped_column(String(30))
    reason:Mapped[str]=mapped_column(String(1000))
    assigned_to:Mapped[int|None]=mapped_column(ForeignKey('users.id',ondelete='RESTRICT'),nullable=True)
    actor_id:Mapped[int]=mapped_column(ForeignKey('users.id',ondelete='RESTRICT'))
    actor_email:Mapped[str]=mapped_column(String(255))
    request_key:Mapped[str]=mapped_column(String(36),unique=True)
    request_snapshot:Mapped[str]=mapped_column(Text)
    recorded_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())


class TicketMessage(Base):
    __tablename__='ticket_messages'
    id:Mapped[int]=mapped_column(primary_key=True)
    ticket_id:Mapped[int]=mapped_column(ForeignKey('support_tickets.id',ondelete='RESTRICT'),index=True)
    event_id:Mapped[int]=mapped_column(ForeignKey('ticket_events.id',ondelete='RESTRICT'),unique=True)
    internal:Mapped[bool]
    body:Mapped[str]=mapped_column(Text)
    actor_id:Mapped[int]=mapped_column(ForeignKey('users.id',ondelete='RESTRICT'))
    actor_email:Mapped[str]=mapped_column(String(255))
    recorded_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())
