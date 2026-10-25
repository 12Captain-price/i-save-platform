"""Optional marketing consent, versioned campaigns and a recipient outbox."""
from datetime import datetime
from sqlalchemy import String,Text,Boolean,Integer,DateTime,ForeignKey,UniqueConstraint,func
from sqlalchemy.orm import Mapped,mapped_column
from app.database import Base

class MarketingPreference(Base):
    __tablename__='marketing_preferences'
    user_id:Mapped[int]=mapped_column(ForeignKey('users.id',ondelete='RESTRICT'),primary_key=True)
    enabled:Mapped[bool]=mapped_column(Boolean,default=False)
    revision:Mapped[int]=mapped_column(default=0)

class MarketingConsentEvent(Base):
    __tablename__='marketing_consent_events'
    id:Mapped[int]=mapped_column(primary_key=True)
    user_id:Mapped[int]=mapped_column(ForeignKey('users.id',ondelete='RESTRICT'),index=True)
    enabled:Mapped[bool]=mapped_column(Boolean)
    source:Mapped[str]=mapped_column(String(40))
    wording:Mapped[str]=mapped_column(Text)
    version:Mapped[str]=mapped_column(String(50))
    actor_id:Mapped[int|None]=mapped_column(ForeignKey('users.id',ondelete='RESTRICT'))
    request_key:Mapped[str]=mapped_column(String(80),unique=True)
    request_snapshot:Mapped[str]=mapped_column(Text)
    recorded_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())

class Campaign(Base):
    __tablename__='campaigns'
    id:Mapped[int]=mapped_column(primary_key=True)
    latest_version:Mapped[int]=mapped_column(default=0)
    state:Mapped[str]=mapped_column(String(30),default='Draft')
    scheduled_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True))

class CampaignVersion(Base):
    __tablename__='campaign_versions'
    __table_args__=(UniqueConstraint('campaign_id','version',name='uq_campaign_version'),)
    id:Mapped[int]=mapped_column(primary_key=True)
    campaign_id:Mapped[int]=mapped_column(ForeignKey('campaigns.id',ondelete='RESTRICT'),index=True)
    version:Mapped[int]=mapped_column()
    content_version_id:Mapped[int]=mapped_column(ForeignKey('content_versions.id',ondelete='RESTRICT'))
    snapshot:Mapped[str]=mapped_column(Text)
    actor_id:Mapped[int]=mapped_column(ForeignKey('users.id',ondelete='RESTRICT'))
    actor_email:Mapped[str]=mapped_column(String(255))
    request_key:Mapped[str]=mapped_column(String(36),unique=True)
    request_snapshot:Mapped[str]=mapped_column(Text)
    recorded_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())

class CampaignEvent(Base):
    __tablename__='campaign_events'
    id:Mapped[int]=mapped_column(primary_key=True)
    campaign_id:Mapped[int]=mapped_column(ForeignKey('campaigns.id',ondelete='RESTRICT'),index=True)
    version_id:Mapped[int]=mapped_column(ForeignKey('campaign_versions.id',ondelete='RESTRICT'))
    action:Mapped[str]=mapped_column(String(30))
    reason:Mapped[str]=mapped_column(String(1000))
    actor_id:Mapped[int]=mapped_column(ForeignKey('users.id',ondelete='RESTRICT'))
    actor_email:Mapped[str]=mapped_column(String(255))
    request_key:Mapped[str]=mapped_column(String(36),unique=True)
    request_snapshot:Mapped[str]=mapped_column(Text)
    recorded_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())

class CampaignRecipient(Base):
    __tablename__='campaign_recipients'
    __table_args__=(UniqueConstraint('campaign_id','user_id',name='uq_campaign_recipient'),)
    id:Mapped[int]=mapped_column(primary_key=True)
    campaign_id:Mapped[int]=mapped_column(ForeignKey('campaigns.id',ondelete='RESTRICT'),index=True)
    version_id:Mapped[int]=mapped_column(ForeignKey('campaign_versions.id',ondelete='RESTRICT'))
    user_id:Mapped[int]=mapped_column(ForeignKey('users.id',ondelete='RESTRICT'))
    email_snapshot:Mapped[str]=mapped_column(String(255))
    state:Mapped[str]=mapped_column(String(40),default='Queued')
    attempts:Mapped[int]=mapped_column(default=0)
    attempted_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True))
    reason:Mapped[str]=mapped_column(String(300),default='')

class CampaignDeliveryEvent(Base):
    __tablename__='campaign_delivery_events'
    id:Mapped[int]=mapped_column(primary_key=True)
    recipient_id:Mapped[int]=mapped_column(ForeignKey('campaign_recipients.id',ondelete='RESTRICT'),index=True)
    state:Mapped[str]=mapped_column(String(40))
    reason:Mapped[str]=mapped_column(String(300))
    recorded_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())

class CampaignUnsubscribeLink(Base):
    __tablename__='campaign_unsubscribe_links'
    token_hash:Mapped[str]=mapped_column(String(64),primary_key=True)
    recipient_id:Mapped[int]=mapped_column(ForeignKey('campaign_recipients.id',ondelete='RESTRICT'),index=True)
    expires_at:Mapped[datetime]=mapped_column(DateTime(timezone=True))
    consumed_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True))
